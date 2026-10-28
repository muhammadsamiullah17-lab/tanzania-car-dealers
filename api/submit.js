// POST /api/submit -> a verified member posts a car. It is saved as "pending" until staff approve it.
// Seller name, phone and dealer link come from the member's verified account, not from the form.
import { ads, newId, savePhoto, readBody, send } from "../lib/store.js";
import { readToken } from "../lib/auth.js";
import { members } from "../lib/members.js";

const BODIES = ["SUV", "Sedan", "Hatchback", "Pickup", "Van", "Wagon", "Coupe", "Truck", "Bus", "Other"];
const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric"];
const GEARS = ["Automatic", "Manual"];

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const t = readToken(req);
  const me = t && t.kind === "m" ? await members.get(t.id).catch(() => null) : null;
  if (!me) return send(res, 401, { error: "Please log in to post a car." });
  if (me.status !== "verified") return send(res, 403, { error: "Your account must be verified before you can post a car." });
  let b;
  try {
    b = await readBody(req);
  } catch {
    return send(res, 400, { error: "Invalid request" });
  }

  const year = Number(b.year), price = Number(b.price), km = Number(b.km);
  const errors = [];
  if (!text(b.make, 40)) errors.push("make");
  if (!text(b.model, 60)) errors.push("model");
  if (!(year >= 1970 && year <= new Date().getFullYear() + 1)) errors.push("year");
  if (!(price >= 100000 && price <= 5e10)) errors.push("price");
  if (!(km >= 0 && km <= 2e6)) errors.push("mileage");
  if (!text(b.city, 40)) errors.push("city");
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 6) : [];
  if (!photos.length) errors.push("at least one photo");
  if (errors.length) return send(res, 400, { error: "Please check: " + errors.join(", ") + "." });

  const id = newId();
  try {
    const urls = [];
    for (let i = 0; i < photos.length; i++) urls.push(await savePhoto(id, i, photos[i]));
    const now = new Date().toISOString();
    const dealer = me.type === "dealer";
    await ads.save({
      id,
      status: "pending",
      make: text(b.make, 40),
      model: text(b.model, 60),
      year, price, km,
      fuel: FUELS.includes(b.fuel) ? b.fuel : "Petrol",
      gearbox: GEARS.includes(b.gearbox) ? b.gearbox : "Automatic",
      body: BODIES.includes(b.body) ? b.body : "Other",
      color: text(b.color, 30),
      city: text(b.city, 40),
      description: text(b.description, 2000),
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
