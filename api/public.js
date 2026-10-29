// POST /api/public { action: "alert" | "report", ... } -> things any visitor can send without an account.
//   alert:  "notify me" about new cars matching a search; staff send the matches on WhatsApp.
//   report: a problem with an ad (fake, sold, wrong price…), reviewed by staff.
import { ads, newId, digits, readBody, send } from "../lib/store.js";
import { alerts, reports, REPORT_REASONS, ALERT_FILTER_KEYS as FILTER_KEYS } from "../lib/buyers.js";

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

const actions = {
  async alert(b) {
    const phone = digits(b.phone);
    if (!/^255[67]\d{8}$/.test(phone)) throw new Error("Enter your WhatsApp number, e.g. 0712 345 678.");
    const filters = {};
    for (const k of FILTER_KEYS) if (b.filters && b.filters[k] != null && String(b.filters[k]).trim()) filters[k] = text(b.filters[k], 60);
    if (!Object.keys(filters).length) throw new Error("Choose at least one filter (for example a make or a budget) first.");
    const a = { id: newId(), name: text(b.name, 60) || "Buyer", phone, filters, notified: [], active: true, createdAt: new Date().toISOString() };
    await alerts.save(a);
    return { ok: true };
  },

  async report(b) {
    const ad = await ads.get(b.adId);
    if (!ad || !["approved", "sold"].includes(ad.status)) throw new Error("Ad not found.");
    if (!REPORT_REASONS.includes(b.reason)) throw new Error("Choose a reason.");
    const phone = b.phone ? digits(b.phone) : "";
    await reports.save({ id: newId(), adId: ad.id, adTitle: `${ad.year} ${ad.make} ${ad.model}`, reason: b.reason, note: text(b.note, 1000),
      phone: /^255\d{9}$/.test(phone) ? phone : "", status: "open", createdAt: new Date().toISOString() });
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
  if (b.website) return send(res, 200, { ok: true }); // honeypot: bots fill hidden fields
  if (!Object.hasOwn(actions, b.action)) return send(res, 400, { error: "Unknown action" });
  try {
    send(res, 200, await actions[b.action](b));
  } catch (e) {
    send(res, 400, { error: e.message });
  }
}
