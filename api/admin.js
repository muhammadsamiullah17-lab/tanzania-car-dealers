// POST /api/admin { action, ... }. Every action except "login" needs the admin token.
import { ads, dealers, newId, digits, sortListings, readBody, send } from "../lib/store.js";
import { checkPassword, issueToken, verifyToken } from "../lib/auth.js";

const STATUSES = ["pending", "approved", "rejected", "sold"];

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

const actions = {
  async listAds() {
    return { ads: sortListings(await ads.all()) };
  },

  async updateAd(b) {
    const ad = await ads.get(b.id);
    if (!ad) throw Object.assign(new Error("Ad not found"), { status: 404 });
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw new Error("Bad status");
      ad.status = b.status;
      if (b.status === "approved" && !ad.approvedAt) ad.approvedAt = new Date().toISOString();
    }
    if (b.featureDays !== undefined) {
      const days = Number(b.featureDays);
      ad.featuredUntil = days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null;
    }
    if (b.dealerId !== undefined) ad.dealerId = b.dealerId || null;
    if (b.price !== undefined && Number(b.price) > 0) ad.price = Number(b.price);
    if (b.adminNote !== undefined) ad.adminNote = text(b.adminNote, 500);
    ad.updatedAt = new Date().toISOString();
    await ads.save(ad);
    return { ad };
  },

  async deleteAd(b) {
    const ad = await ads.get(b.id);
    if (ad) await ads.remove(ad);
    return { ok: true };
  },

  async listDealers() {
    return { dealers: (await dealers.all()).sort((a, b) => a.name.localeCompare(b.name)) };
  },

  async saveDealer(b) {
    const name = text(b.name, 80), whatsapp = digits(b.whatsapp);
    if (!name) throw new Error("Dealer name is required");
    if (!/^255\d{9}$/.test(whatsapp)) throw new Error("Dealer WhatsApp must be a Tanzanian number");
    const existing = b.id ? await dealers.get(b.id) : null;
    const dealer = {
      id: existing ? existing.id : newId(),
      name,
      whatsapp,
      city: text(b.city, 40),
      address: text(b.address, 160),
      about: text(b.about, 1000),
      verified: Boolean(b.verified),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await dealers.save(dealer);
    return { dealer };
  },

  async deleteDealer(b) {
    const linked = (await ads.all()).filter((a) => a.dealerId === b.id);
    for (const ad of linked) {
      ad.dealerId = null;
      await ads.save(ad);
    }
    await dealers.remove(b.id);
    return { ok: true };
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
  if (b.action === "login") {
    if (!checkPassword(b.password)) return send(res, 401, { error: "Wrong password" });
    return send(res, 200, { token: issueToken() });
  }
  if (!verifyToken(req)) return send(res, 401, { error: "Please log in again" });
  const fn = actions[b.action];
  if (!fn) return send(res, 400, { error: "Unknown action" });
  try {
    send(res, 200, await fn(b));
  } catch (e) {
    console.error(e);
    send(res, e.status || 400, { error: e.message });
  }
}
