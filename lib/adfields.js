// The car details a seller can set on an ad, validated in one place for posting and editing.
export const BODIES = ["SUV", "Sedan", "Hatchback", "Pickup", "Van", "Wagon", "Coupe", "Truck", "Bus", "Other"];
export const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric"];
export const GEARS = ["Automatic", "Manual"];
export const DRIVES = ["2WD", "4WD"];
export const ASSEMBLY = ["Imported", "Local"];
export const FEATURES = [
  "Air conditioning", "Climate control", "Power steering", "Power windows", "Power mirrors", "Central locking", "Keyless entry",
  "Push start", "Cruise control", "Steering controls", "ABS", "Airbags", "Traction control", "Immobilizer", "Reverse camera",
  "Parking sensors", "Navigation", "Bluetooth", "Touch screen", "Leather seats", "Heated seats", "Sunroof", "Alloy wheels",
  "Fog lights", "LED headlights", "Roof rails", "Tow bar", "Third row seats",
];

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

// Returns the validated fields, or throws with a list of what to fix.
export function adFields(b) {
  const year = Number(b.year), price = Number(b.price), km = Number(b.km);
  const cc = b.cc === "" || b.cc == null ? null : Number(b.cc);
  const owners = b.owners === "" || b.owners == null ? null : Number(b.owners);
  const errors = [];
  if (!text(b.make, 40)) errors.push("make");
  if (!text(b.model, 60)) errors.push("model");
  if (!(year >= 1970 && year <= new Date().getFullYear() + 1)) errors.push("year");
  if (!(price >= 100000 && price <= 5e10)) errors.push("price");
  if (!(km >= 0 && km <= 2e6)) errors.push("mileage");
  if (!text(b.city, 40)) errors.push("city");
  if (cc !== null && !(cc >= 50 && cc <= 10000)) errors.push("engine size");
  if (owners !== null && !(owners >= 0 && owners <= 20)) errors.push("number of owners");
  if (errors.length) throw Object.assign(new Error("Please check: " + errors.join(", ") + "."), { status: 400 });
  return {
    make: text(b.make, 40),
    model: text(b.model, 60),
    year, price, km, cc, owners,
    fuel: FUELS.includes(b.fuel) ? b.fuel : "Petrol",
    gearbox: GEARS.includes(b.gearbox) ? b.gearbox : "Automatic",
    drive: DRIVES.includes(b.drive) ? b.drive : "2WD",
    assembly: ASSEMBLY.includes(b.assembly) ? b.assembly : "Imported",
    registeredIn: text(b.registeredIn, 40),
    body: BODIES.includes(b.body) ? b.body : "Other",
    color: text(b.color, 30),
    city: text(b.city, 40),
    description: text(b.description, 2000),
    features: Array.isArray(b.features) ? FEATURES.filter((f) => b.features.includes(f)) : [],
  };
}

export function checkPrice(v) {
  const price = Number(v);
  if (!(price >= 100000 && price <= 5e10)) throw Object.assign(new Error("Enter a price of at least TZS 100,000."), { status: 400 });
  return price;
}
