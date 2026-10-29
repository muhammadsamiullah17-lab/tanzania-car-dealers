// POST /api/pay { action, ... } -> a verified member buys a Featured ad or a dealer package.
//   options   -> prices, which payment ways are on, and what the member can buy
//   create    -> new order; Lipa: shows the number to pay; Selcom: sends the PIN prompt to the phone
//   submitCode-> Lipa: the transaction code from the payment SMS, for staff to check
//   status    -> Selcom: asks Selcom and activates when COMPLETED
//   cancel, myOrders
// POST /api/pay?webhook=1 -> Selcom's callback. Never trusted alone: we re-check the order with Selcom.
import { ads, dealers, digits, readBody, send } from "../lib/store.js";
import { readToken } from "../lib/auth.js";
import { members } from "../lib/members.js";
import { orders, getPaySettings, publicPaySettings, selcomCreds, findPackage, newOrder, refreshSelcom } from "../lib/payments.js";
import { createOrder, pushToPhone } from "../lib/selcom.js";

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

function viewOrder(o) {
  const { notes, ...rest } = o;
  return rest;
}

async function eligible(me) {
  const mine = (await ads.all()).filter((a) => a.memberId === me.id && a.status === "approved");
  const dealer = me.type === "dealer" && me.dealerId ? await dealers.get(me.dealerId) : null;
  return {
    ads: mine.map((a) => ({ id: a.id, title: `${a.year} ${a.make} ${a.model}`, price: a.price, featuredUntil: a.featuredUntil || null, photo: (a.photos || [])[0] || null })),
    dealer: dealer ? { id: dealer.id, name: dealer.name, packageTier: dealer.packageTier || null, packageUntil: dealer.packageUntil || null } : null,
  };
}

const actions = {
  async options(b, me, s) {
    return { settings: publicPaySettings(s), ...(await eligible(me)) };
  },

  async create(b, me, s) {
    const type = b.type === "dealer" ? "dealer" : "feature";
    const pkg = findPackage(s, type, b.packageId);
    if (!pkg) throw fail("Choose a package.");
    const fields = { memberId: me.id, memberName: me.type === "dealer" && me.business ? me.business.name : me.fullName, memberPhone: me.phone,
      type, packageId: pkg.id, packageName: pkg.name, days: pkg.days, amount: pkg.price, notes: [] };
    if (type === "feature") {
      const ad = await ads.get(b.adId);
      if (!ad || ad.memberId !== me.id) throw fail("Car not found.", 404);
      if (ad.status !== "approved") throw fail("Only live cars can be featured. Wait until our team approves it.");
      Object.assign(fields, { adId: ad.id, itemTitle: `${ad.year} ${ad.make} ${ad.model}` });
    } else {
      if (me.type !== "dealer" || !me.dealerId) throw fail("Dealer packages are for verified dealers with a dealer page.");
      const d = await dealers.get(me.dealerId);
      if (!d) throw fail("Your dealer page was not found. Contact us.");
      Object.assign(fields, { dealerId: d.id, tier: pkg.tier, itemTitle: d.name });
    }
    const pub = publicPaySettings(s);
    if (b.method === "selcom") {
      if (!pub.selcom.available) throw fail("Automatic mobile payment is not switched on yet. Please use a Lipa number.");
      const phone = digits(b.phone || me.phone);
      if (!/^255[67]\d{8}$/.test(phone)) throw fail("Enter the mobile-money number to pay from, e.g. 0712 345 678.");
      const order = newOrder({ ...fields, method: "selcom", payPhone: phone });
      const creds = selcomCreds(s);
      const host = b.origin && /^https:\/\/[a-z0-9.-]+$/i.test(b.origin) ? b.origin : "https://tanzania-car-dealers.vercel.app";
      await orders.save(order);
      try {
        await createOrder(creds, { orderId: order.id, email: me.email || "payments@tanzaniacardealers.co.tz", name: fields.memberName, phone, amount: order.amount,
          webhook: host + "/api/pay?webhook=1", remarks: order.ref + " " + order.packageName });
        const transid = "T" + order.id.slice(0, 12);
        await pushToPhone(creds, order.id, transid, phone);
        order.status = "pushed";
        order.selcom = { transid, pushedAt: new Date().toISOString() };
      } catch (e) {
        order.status = "failed";
        order.error = text(e.message, 300);
        await orders.save(order);
        throw fail("We could not send the payment prompt: " + e.message, 502);
      }
      await orders.save(order);
      return { order: viewOrder(order) };
    }
    const lipa = pub.lipa.find((l) => l.network === b.network);
    if (!lipa) throw fail("Choose how you will pay.");
    const order = newOrder({ ...fields, method: "lipa", network: lipa.network, payTo: lipa.number, payToName: lipa.accountName });
    await orders.save(order);
    return { order: viewOrder(order) };
  },

  async submitCode(b, me) {
    const o = await orders.get(b.id);
    if (!o || o.memberId !== me.id || o.method !== "lipa") throw fail("Order not found.", 404);
    if (!["pending", "awaiting_check", "rejected"].includes(o.status)) throw fail("This order is already " + o.status + ".");
    const code = text(b.code, 40).toUpperCase();
    if (code.length < 6) throw fail("Enter the transaction code from your payment SMS (e.g. QKJ2ABC123).");
    const dupe = (await orders.all()).find((x) => x.id !== o.id && x.txCode === code);
    if (dupe) throw fail("This transaction code was already used for another order.");
    o.txCode = code;
    o.payPhone = digits(b.phone || me.phone);
    o.status = "awaiting_check";
    o.submittedAt = new Date().toISOString();
    await orders.save(o);
    return { order: viewOrder(o) };
  },

  async status(b, me, s) {
    let o = await orders.get(b.id);
    if (!o || o.memberId !== me.id) throw fail("Order not found.", 404);
    try { o = await refreshSelcom(o, s); } catch (e) { /* Selcom unreachable: keep the current status */ }
    return { order: viewOrder(o) };
  },

  async cancel(b, me) {
    const o = await orders.get(b.id);
    if (!o || o.memberId !== me.id) throw fail("Order not found.", 404);
    if (!["pending", "pushed", "awaiting_check", "failed"].includes(o.status)) throw fail("This order can't be cancelled.");
    o.status = "cancelled";
    await orders.save(o);
    return { order: viewOrder(o) };
  },

  async myOrders(b, me) {
    const mine = (await orders.all()).filter((o) => o.memberId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { orders: mine.map(viewOrder) };
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  let b;
  try {
    b = await readBody(req);
  } catch {
    return send(res, 400, { error: "Invalid request" });
  }
  try {
    const s = await getPaySettings();
    if (req.query.webhook) {
      const o = await orders.get(String(b.order_id || ""));
      if (o) await refreshSelcom(o, s).catch((e) => console.error("webhook re-check failed", e.message));
      return send(res, 200, { result: "SUCCESS", resultcode: "000" });
    }
    if (!Object.hasOwn(actions, b.action)) return send(res, 400, { error: "Unknown action" });
    const t = readToken(req);
    const me = t && t.kind === "m" ? await members.get(t.id) : null;
    if (!me || me.status === "suspended") return send(res, 401, { error: "Please log in again" });
    if (me.status !== "verified") return send(res, 403, { error: "Your account must be verified first." });
    send(res, 200, await actions[b.action](b, me, s));
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 400, { error: e.message });
  }
}
