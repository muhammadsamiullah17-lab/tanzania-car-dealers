// POST /api/submit -> a verified member posts a car. It is saved as "pending" until staff approve it.
// Seller name, phone and dealer link come from the member's verified account, not from the form.
// Every car needs its number plate, chassis number and papers, and may be listed only once (lib/ownership.js).
import { ads, newId, savePhoto, readBody, send } from "../lib/store.js";
import { readToken } from "../lib/auth.js";
import { members } from "../lib/members.js";
import { adFields } from "../lib/adfields.js";
import { getSite } from "../lib/site.js";
import { ownershipFields, assertNotListed, savePaper } from "../lib/ownership.js";

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
  let fields, owner;
  try {
    fields = adFields(b);
    owner = ownershipFields(b);
    await assertNotListed(owner, me);
  } catch (e) {
    return send(res, e.status || 400, { error: e.message });
  }
  const papers = Array.isArray(b.papers) ? b.papers.slice(0, 4) : [];
  if (!papers.length) return send(res, 400, { error: "Please add a copy of the car's registration card (or import papers if it is not registered yet)." });
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 10) : [];
  if (!photos.length) return send(res, 400, { error: "Please check: at least one photo." });

  const id = newId();
  try {
    const urls = [];
    for (const p of photos) urls.push(await savePhoto("ad:" + id, p));
    const savedPapers = [];
    for (const p of papers) savedPapers.push(await savePaper(id, p && p.data, p && p.name));
    const now = new Date().toISOString();
    const dealer = me.type === "dealer";
    await ads.save({
      id,
      status: "pending",
      ...fields,
      ...owner,
      papers: savedPapers,
      declaredAt: now,
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
