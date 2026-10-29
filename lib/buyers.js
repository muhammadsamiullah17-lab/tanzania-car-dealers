// Things buyers leave for staff: "notify me" alerts for a search, and reports about ads.
// Also the inspection report staff can attach to an ad ("TCD Inspected").
import { collection } from "./store.js";

export const alerts = collection("alerts");
export const reports = collection("reports");
export const REPORT_REASONS = ["Fake ad", "Already sold", "Wrong price", "Wrong phone number", "Scam or asked for deposit", "Other"];
export const ALERT_FILTER_KEYS = ["q", "make", "body", "city", "pmin", "pmax", "ymin", "ymax", "kmax", "gearbox", "fuel", "drive", "seller", "photos", "inspected"];
export const INSPECTION_AREAS = ["Engine", "Gearbox", "Suspension and steering", "Brakes", "Body and paint", "Interior", "Electrical", "AC", "Tyres"];

function num(v, min, max, label) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw Object.assign(new Error("Check " + label + "."), { status: 400 });
  return n;
}

// Validates an inspection report from the admin form.
export function inspectionFields(b, by) {
  const scores = {};
  for (const area of INSPECTION_AREAS) scores[area] = num(b.scores && b.scores[area], 0, 100, area + " score (0 to 100)");
  return {
    date: b.date ? new Date(b.date).toISOString() : new Date().toISOString(),
    overall: Math.round(num(b.overall, 0, 10, "the overall score (0 to 10)") * 10) / 10,
    scores,
    mileageChecked: Boolean(b.mileageChecked),
    documentsChecked: Boolean(b.documentsChecked),
    accidentFree: Boolean(b.accidentFree),
    notes: String(b.notes ?? "").trim().slice(0, 2000),
    by,
  };
}
