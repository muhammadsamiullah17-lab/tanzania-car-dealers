// POST /api/submit -> a seller posts a car. It is saved as "pending" until an admin approves it.
import { ads, newId, savePhoto, digits, readBody, send } from "../lib/store.js";

const BODIES = ["SUV", "Sedan", "Hatchback", "Pickup", "Van", "Wagon", "Coupe", "Truck", "Bus", "Other"];
const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric"];
const GEARS = ["Automatic", "Manual"];

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  let b;
  try {
    b = await readBody(req);
  } catch {
    return send(res, 400, { error: "Invalid request" });
  }
  if (b.website) return send(res, 200, { ok: true }); // honeypot: bots fill hidden fields

  const year = Number(b.year), price = Number(b.price), km = Number(b.km);
  const phone = digits(b.sellerPhone);
  const errors = [];
  if (!text(b.make, 40)) errors.push("make");
  if (!text(b.model, 60)) errors.push("model");
  if (!(year >= 1970 && year <= new Date().getFullYear() + 1)) errors.push("year");
  if (!(price >= 100000 && price <= 5e10)) errors.push("price");
  if (!(km >= 0 && km <= 2e6)) errors.push("mileage");
  if (!text(b.city, 40)) errors.push("city");
  if (!text(b.sellerName, 60)) errors.push("your name");
  if (!/^255\d{9}$/.test(phone)) errors.push("WhatsApp number");
  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 6) : [];
  if (!photos.length) errors.push("at least one photo");
  if (errors.length) return send(res, 400, { error: "Please check: " + errors.join(", ") + "." });

  const id = newId();
  try {
    const urls = [];
    for (let i = 0; i < photos.length; i++) urls.push(await savePhoto(id, i, photos[i]));
    const now = new Date().toISOString();
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
      sellerName: text(b.sellerName, 60),
      sellerPhone: phone,
      sellerType: b.sellerType === "dealer" ? "dealer" : "private",
      businessName: b.sellerType === "dealer" ? text(b.businessName, 80) : "",
      dealerId: null,
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
