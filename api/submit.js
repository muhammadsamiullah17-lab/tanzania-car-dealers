// POST /api/submit -> a verified member posts a car. It is saved as "pending" until staff approve it.
// Seller name, phone and dealer link come from the member's verified account, not from the form.
import { ads, newId, savePhoto, readBody, send } from "../lib/store.js";
import { readToken } from "../lib/auth.js";
import { members } from "../lib/members.js";
import { adFields } from "../lib/adfields.js";
import { getSite } from "../lib/site.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const t = readToken(req);
  const me = t && t.kind === "m" ? await members.get(t.id).catch(() => null) : null;
  if (!me) return send(res, 401, { error: "Please log in to post a car." });
  if (me.status !== "verified") return send(res, 403, { error: "Your account must be verified before you can post a car." });
  if (me.type !== "dealer" && !(await getSite()).privateSellersEnabled) return send(res, 403, { error: "For now only verified car dealers can post cars." });
  let b;
  try {
    b = await readBody(req);
  } catch {
    return send(res, 400, { error: "Invalid request" });
  }
  let fields;
  try {
    fields = adFields(b);
  } catch (e) {
    return send(res, 400, { error: e.message });
  }
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 10) : [];
  if (!photos.length) return send(res, 400, { error: "Please check: at least one photo." });

  const id = newId();
  try {
    const urls = [];
    for (const p of photos) urls.push(await savePhoto("ad:" + id, p));
    const now = new Date().toISOString();
    const dealer = me.type === "dealer";
    await ads.save({
      id,
      status: "pending",
      ...fields,
      memberId: me.id,
      sellerName: me.fullName,
      sellerPhone: me.phone,
      sellerType: dealer ? "dealer" : "private",
      sellerVerified: true,
      businessName: dealer && me.business ? me.business.name : "",
      dealerId: dealer ? me.dealerId : null,
      featuredUntil: null,
      photos: urls,
      createdAt: now,
      updatedAt: now,
    });
    send(res, 200, { ok: true, id });
  } catch (e) {
    console.error(e);
    send(res, 400, { error: e.message || "Could not save your ad" });
  }
}
