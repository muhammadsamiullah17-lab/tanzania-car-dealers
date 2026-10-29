// POST /api/account { action, ... } for customer members, plus the one login used by everyone.
// "signup" and "login" are open; the rest need a member session.
import { ads, files, sortListings, savePhoto, photoFileId, readBody, send } from "../lib/store.js";
import { adFields, checkPrice } from "../lib/adfields.js";
import { issueToken, readToken } from "../lib/auth.js";
import { users, publicUser } from "../lib/users.js";
import { checkNewPassword, hashPassword, verifyPassword } from "../lib/secure.js";
import { members, cleanPhone, profileFields, newMember, missing, selfView, saveDoc, DOC_KINDS, ACCOUNT_TYPES } from "../lib/members.js";
import { deals, buyerView } from "../lib/deals.js";
import { getPaySettings } from "../lib/payments.js";
import { newId } from "../lib/store.js";

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// Members can edit their details and documents until they are verified.
function editable(me) {
  if (["verified", "suspended"].includes(me.status)) throw fail("Your account is " + me.status + ". Contact us on WhatsApp to change your details.");
}

const open = {
  async signup(b) {
    const type = ACCOUNT_TYPES.includes(b.type) ? b.type : "private";
    const phone = cleanPhone(b.phone);
    checkNewPassword(b.password);
    if (!b.consent) throw fail(type === "buyer" ? "Please agree to the terms." : "Please agree to the verification terms.");
    if (await members.byPhone(phone)) throw fail("An account with this phone number already exists. Please log in.", 409);
    const m = newMember(type, phone, b.password, profileFields(type, b));
    await members.save(m);
    return { token: issueToken("m", m.id), kind: "m", user: selfView(m) };
  },

  // One login for everyone: a phone number logs in a customer, anything else is a staff ID.
  // A number that matches no customer is still tried as a staff ID.
  async login(b) {
    const id = String(b.identifier || "").trim();
    let m = null;
    if (/^[+\d\s-]+$/.test(id)) {
      try { m = await members.byPhone(cleanPhone(id)); } catch { m = null; }
    }
    if (m) {
      if (!verifyPassword(b.password, m.passwordHash)) throw fail("Wrong phone number or password.", 401);
      if (m.status === "suspended") throw fail("This account is suspended. Contact us on WhatsApp.", 403);
      m.lastLoginAt = new Date().toISOString();
      await members.save(m);
      return { token: issueToken("m", m.id), kind: "m", user: selfView(m) };
    }
    const u = await users.byUsername(id.toLowerCase());
    if (!u || !verifyPassword(b.password, u.passwordHash)) throw fail("Wrong phone number / ID or password.", 401);
    if (!u.active) throw fail("This account is disabled. Ask your admin.", 403);
    u.lastLoginAt = new Date().toISOString();
    await users.save(u);
    return { token: issueToken("s", u.id), kind: "s", user: publicUser(u) };
  },
};

const actions = {
  async me(b, me) {
    return { user: selfView(me), docKinds: DOC_KINDS[me.type], paidEnabled: Boolean((await getPaySettings()).paidEnabled) };
  },

  async updateProfile(b, me) {
    editable(me);
    Object.assign(me, profileFields(me.type, b));
    if (me.status === "rejected") me.status = "incomplete";
    me.updatedAt = new Date().toISOString();
    await members.save(me);
    return { user: selfView(me) };
  },

  async uploadDoc(b, me) {
    editable(me);
    await saveDoc(me, b.kind, b.data, b.name);
    if (me.status === "review") me.docsChecked = false;
    me.updatedAt = new Date().toISOString();
    await members.save(me);
    return { user: selfView(me) };
  },

  // A buyer who wants to sell too: becomes a private seller and goes through verification.
  async becomeSeller(b, me) {
    if (me.type !== "buyer") throw fail("You already have a seller account.");
    me.type = b.asDealer ? "dealer" : "private";
    if (me.type === "dealer") me.business = { name: String(b.businessName || "").trim().slice(0, 100), tin: "", licenceNo: "", brelaNo: "", address: "" };
    if (me.type === "dealer" && !me.business.name) throw fail("Please enter the business name.");
    me.status = "incomplete";
    me.updatedAt = new Date().toISOString();
    await members.save(me);
    return { user: selfView(me) };
  },

  // "Buy through us": our team manages buying this car for the member.
  async requestDeal(b, me) {
    let car = null;
    // Our own stock (cars.js, ids h1, h2…) only lives in the browser; the page sends its title and price.
    if (/^h\d+$/.test(String(b.adId || ""))) {
      const m = /^(\d{4}) ([A-Za-z-]+) ([\w .()/-]+)$/.exec(String(b.title || "").trim().slice(0, 120));
      if (m) car = { house: true, year: m[1], make: m[2], model: m[3], price: Math.round(Number(b.price)) || 0 };
    } else {
      const ad = await ads.get(b.adId);
      if (ad && ad.status === "approved") car = ad;
    }
    if (!car) throw fail("This car is no longer for sale.", 404);
    if (car.memberId === me.id) throw fail("This is your own car.");
    const open = (await deals.all()).find((d) => d.memberId === me.id && d.adId === String(b.adId) && !["completed", "cancelled"].includes(d.status));
    if (open) throw fail("You already asked us about this car. We will contact you soon.");
    const offer = b.offer ? Math.round(Number(String(b.offer).replace(/[^\d]/g, ""))) : null;
    const id = newId();
    const d = {
      id, ref: "BUY-" + id.slice(0, 6).toUpperCase(), adId: String(b.adId), house: Boolean(car.house),
      adTitle: car.year + " " + car.make + " " + car.model, adPrice: car.price, sellerName: car.house ? "Tanzania Car Dealers" : car.businessName || car.sellerName || "", sellerPhone: car.sellerPhone || "",
      memberId: me.id, buyerName: me.type === "dealer" && me.business ? me.business.name : me.fullName, buyerPhone: me.phone,
      offer: offer && offer > 0 ? offer : null, message: String(b.message || "").trim().slice(0, 1000),
      contactBy: ["whatsapp", "call"].includes(b.contactBy) ? b.contactBy : "whatsapp",
      status: "new", staffMessage: "", notes: [], createdAt: new Date().toISOString(),
    };
    await deals.save(d);
    return { deal: buyerView(d) };
  },

  async myDeals(b, me) {
    return { deals: (await deals.all()).filter((d) => d.memberId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(buyerView) };
  },

  async submitForReview(b, me) {
    if (me.type === "buyer") throw fail("Buyer accounts don't need verification. To sell a car, choose Become a seller.");
    editable(me);
    const gaps = missing(me);
    if (gaps.length) throw fail("Still missing: " + gaps.join(", ") + ".");
    me.status = "review";
    me.submittedAt = new Date().toISOString();
    me.updatedAt = me.submittedAt;
    await members.save(me);
    return { user: selfView(me) };
  },

  async changePassword(b, me) {
    if (!verifyPassword(b.currentPassword, me.passwordHash)) throw fail("Your current password is wrong.");
    me.passwordHash = hashPassword(checkNewPassword(b.newPassword));
    me.updatedAt = new Date().toISOString();
    await members.save(me);
    return { ok: true };
  },

  async myAds(b, me) {
    return { ads: sortListings((await ads.all()).filter((a) => a.memberId === me.id)) };
  },

  async getMyAd(b, me) {
    return { ad: await ownAd(b.id, me) };
  },

  // Changing details or photos sends a live ad back for staff approval, so an approved ad can't
  // be swapped for a different car. keepPhotos: existing photo URLs to keep; newPhotos: data URLs.
  async updateMyAd(b, me) {
    const ad = await ownAd(b.id, me);
    if (ad.status === "sold") throw fail("This car is marked as sold.");
    const fields = adFields(b);
    const keep = (b.keepPhotos || []).filter((u) => ad.photos.includes(u));
    const added = [];
    for (const p of (b.newPhotos || []).slice(0, 10 - keep.length)) added.push(await savePhoto("ad:" + ad.id, p));
    if (!keep.length && !added.length) throw fail("Keep or add at least one photo.");
    for (const u of ad.photos.filter((u) => !keep.includes(u))) await files.remove(photoFileId(u)).catch(() => {});
    if (fields.price < ad.price) ad.priceDroppedAt = new Date().toISOString();
    Object.assign(ad, fields, { photos: keep.concat(added), status: "pending", editedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: "seller" });
    await ads.save(ad);
    return { ad };
  },

  // A price change stays live (no new approval needed).
  async setMyAdPrice(b, me) {
    const ad = await ownAd(b.id, me);
    if (ad.status === "sold") throw fail("This car is marked as sold.");
    const price = checkPrice(b.price);
    if (price < ad.price) ad.priceDroppedAt = new Date().toISOString();
    ad.priceHistory = (ad.priceHistory || []).concat({ price: ad.price, until: new Date().toISOString() });
    ad.price = price;
    ad.updatedAt = new Date().toISOString();
    ad.updatedBy = "seller";
    await ads.save(ad);
    return { ad };
  },

  async markMyAdSold(b, me) {
    const ad = await ownAd(b.id, me);
    ad.status = "sold";
    ad.soldAt = new Date().toISOString();
    ad.featuredUntil = null;
    ad.updatedAt = ad.soldAt;
    ad.updatedBy = "seller";
    await ads.save(ad);
    return { ad };
  },

  async deleteMyAd(b, me) {
    const ad = await ownAd(b.id, me);
    await ads.remove(ad);
    return { ok: true };
  },
};

async function ownAd(id, me) {
  const ad = await ads.get(id);
  if (!ad || ad.memberId !== me.id) throw fail("Car not found.", 404);
  return ad;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  let b;
  try {
    b = await readBody(req);
  } catch {
    return send(res, 400, { error: "Invalid request" });
  }
  try {
    if (Object.hasOwn(open, b.action)) return send(res, 200, await open[b.action](b));
    const fn = Object.hasOwn(actions, b.action) ? actions[b.action] : null;
    if (!fn) return send(res, 400, { error: "Unknown action" });
    const t = readToken(req);
    const me = t && t.kind === "m" ? await members.get(t.id) : null;
    if (!me || me.status === "suspended") return send(res, 401, { error: "Please log in again" });
    send(res, 200, await fn(b, me));
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 400, { error: e.message });
  }
}
