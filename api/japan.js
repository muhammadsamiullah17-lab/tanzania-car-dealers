// GET  /api/japan            -> Japan cars on show + the import rates (for landed-cost estimates)
// GET  /api/japan?id=<id>    -> one Japan car + rates
// POST /api/japan { action: "request" | "myRequests" } -> a logged-in member asks us to find a car
import { newId, readBody, send } from "../lib/store.js";
import { readToken } from "../lib/auth.js";
import { members } from "../lib/members.js";
import { jcars, jrequests, getSettings, publicJcar } from "../lib/japan.js";
import { getSite, publicSite } from "../lib/site.js";

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

async function get(req, res) {
  const id = req.query.id;
  const [settings, site] = await Promise.all([getSettings(), getSite()]);
  const { delivery, deliveryNote } = publicSite(site);
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
  if (id) {
    const c = await jcars.get(id);
    if (!c || c.status === "hidden") return send(res, 404, { error: "Not found" });
    return send(res, 200, { car: publicJcar(c), settings, delivery, deliveryNote });
  }
  const order = { available: 0, coming: 1, reserved: 2, sold: 3 };
  const cars = (await jcars.all()).filter((c) => c.status !== "hidden")
    .sort((a, b) => (order[a.status] - order[b.status]) || (b.createdAt || "").localeCompare(a.createdAt || ""))
    .map(publicJcar);
  send(res, 200, { cars, settings, delivery, deliveryNote });
}

async function post(req, res) {
  const t = readToken(req);
  const me = t && t.kind === "m" ? await members.get(t.id) : null;
  if (!me || me.status === "suspended") return send(res, 401, { error: "Please log in to send a request." });
  const b = await readBody(req);
  if (b.action === "myRequests") {
    const mine = (await jrequests.all()).filter((r) => r.memberId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return send(res, 200, { requests: mine.map(({ notes, ...r }) => r) });
  }
  if (b.action !== "request") return send(res, 400, { error: "Unknown action" });
  const r = {
    id: newId(),
    memberId: me.id,
    name: me.type === "dealer" && me.business ? me.business.name : me.fullName,
    phone: me.phone,
    make: text(b.make, 40),
    model: text(b.model, 60),
    yearFrom: Number(b.yearFrom) || null,
    budgetTzs: Number(b.budgetTzs) || null,
    details: text(b.details, 1500),
    status: "new",
    notes: [],
    createdAt: new Date().toISOString(),
  };
  if (!r.make && !r.model && !r.details) return send(res, 400, { error: "Tell us which car you want." });
  await jrequests.save(r);
  send(res, 200, { ok: true, id: r.id });
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return await get(req, res);
    if (req.method === "POST") return await post(req, res);
    send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Something went wrong" });
  }
}
