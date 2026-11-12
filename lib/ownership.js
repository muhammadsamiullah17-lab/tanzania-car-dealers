// Who owns a car on the site: every ad carries the car's number plate, its chassis number and
// a copy of its papers (registration card, or import papers for a car not yet registered).
// One car can be listed only once: a chassis number or number plate already on any ad (pending,
// live, sold or rejected) blocks a new ad until that ad is deleted. Papers are encrypted and only
// staff can open them; the public never sees the plate, chassis number or papers.
import { ads, files, newId } from "./store.js";
import { encryptBuffer, decryptBuffer } from "./secure.js";

const MAX_DOC = 3 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const PRIVATE = ["plate", "chassis", "notRegistered", "papers", "declaredAt", "papersCheckedBy", "papersCheckedAt"];

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// "t 123 abc" -> "T123ABC"; "nze141-123 4567" -> "NZE1411234567"
export const cleanPlate = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const cleanChassis = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Validated plate / chassis / declaration from the sell form.
export function ownershipFields(b) {
  const notRegistered = Boolean(b.notRegistered);
  const plate = notRegistered ? "" : cleanPlate(b.plate);
  const chassis = cleanChassis(b.chassis);
  if (!notRegistered && !/^[A-Z0-9]{4,10}$/.test(plate)) throw fail("Enter the car's number plate, e.g. T 123 ABC. If it is a new import with no plate yet, tick \"Not registered yet\".");
  if (!/^[A-Z0-9]{6,20}$/.test(chassis)) throw fail("Enter the chassis number (VIN / frame number) exactly as on the registration card, e.g. NZE141-1234567.");
  if (!b.declare) throw fail("Please tick the box to confirm the car is yours to sell and the papers are genuine.");
  return { plate, chassis, notRegistered };
}

// Another ad (any status) with the same chassis number or number plate, or null.
export async function findDuplicate({ chassis, plate }, exceptId) {
  return (await ads.all()).find((a) => a.id !== exceptId && ((chassis && a.chassis === chassis) || (plate && a.plate === plate))) || null;
}

// Throws a clear message when the car is already on the site.
export async function assertNotListed(fields, me, exceptId) {
  const dup = await findDuplicate(fields, exceptId);
  if (!dup) return;
  const what = dup.chassis === fields.chassis ? "chassis number " + fields.chassis : "number plate " + fields.plate;
  if (me && dup.memberId === me.id) throw fail(`You already posted this car (${what}, ad ID ${dup.id}). Edit that ad instead of posting it again.`, 409);
  throw fail(`A car with ${what} is already on Tanzania Car Dealers. Each car can be listed only once. If you bought it from another dealer, they must delete their ad first; then you can post it. If you think this is wrong, contact us on WhatsApp.`, 409);
}

// Saves one paper (photo or PDF data URL), encrypted, owned by the ad so deleting the ad deletes it.
export async function savePaper(adId, dataUrl, name) {
  const m = /^data:([a-z]+\/[a-z.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m || !TYPES[m[1]]) throw fail("Car papers must be a photo (JPG, PNG) or a PDF.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_DOC) throw fail("A car paper is too large (max 3 MB). Take a photo instead of a scan.");
  const fileId = await files.put("ad:" + adId, "application/octet-stream", encryptBuffer("docs", buf), false);
  return { id: newId(), name: String(name || "").slice(0, 120) || "paper." + TYPES[m[1]], contentType: m[1], size: buf.length, fileId, uploadedAt: new Date().toISOString() };
}

// keepIds: papers already on the ad to keep; added: new data URLs. At least one paper, at most 4.
export async function updatePapers(ad, keepIds, added) {
  const keep = (ad.papers || []).filter((p) => (keepIds || []).includes(p.id));
  const fresh = (added || []).slice(0, Math.max(0, 4 - keep.length));
  if (!keep.length && !fresh.length) throw fail("Add a copy of the car's registration card (or import papers if it is not registered yet).");
  const saved = [];
  for (const p of fresh) saved.push(await savePaper(ad.id, p.data, p.name));
  for (const p of (ad.papers || []).filter((p) => !keep.includes(p))) await files.remove(p.fileId).catch(() => {});
  ad.papers = keep.concat(saved);
}

export async function readPaper(paper) {
  const f = await files.get(paper.fileId);
  if (!f) throw fail("Paper not found", 404);
  return decryptBuffer("docs", f.buf);
}

// Removes the ownership details from an ad for the public; adds a "papers checked" flag instead.
export function stripOwnership(ad) {
  const out = { ...ad };
  for (const k of PRIVATE) delete out[k];
  out.papersChecked = Boolean(ad.papersCheckedAt);
  return out;
}

// Before a car goes live: papers present, checked by staff, and no other ad for the same car.
export async function assertCanApprove(ad, papersChecked) {
  if (!ad.chassis || !(ad.papers || []).length) throw fail("This car has no chassis number or papers yet. Ask the seller to edit the ad and add them before you approve it.");
  if (!papersChecked && !ad.papersCheckedAt) throw fail("Tick that you checked the chassis number and papers before approving.");
  await assertNotListed({ chassis: ad.chassis, plate: ad.plate }, null, ad.id);
}
