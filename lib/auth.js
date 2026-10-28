// Sessions: a signed token "<kind>.<id>.<expiry>.<hmac>" kept in the browser.
// kind is "s" for staff (admin/manager/staff) and "m" for customer members.
// ADMIN_PASSWORD is only the one-time setup key used to create the first admin account.
import crypto from "node:crypto";

const TTL_MS = 12 * 60 * 60 * 1000;

function sign(value) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(value).digest("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkSetupKey(key) {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && safeEqual(String(key || "").trim(), expected.trim());
}

export function issueToken(kind, id) {
  const body = `${kind}.${id}.${Date.now() + TTL_MS}`;
  return `${body}.${sign(body)}`;
}

// Returns { kind, id } from a valid, unexpired token, or null.
export function readToken(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const [kind, id, exp, mac] = token.split(".");
  if (!["s", "m"].includes(kind) || !id || !exp || !mac || Number(exp) < Date.now()) return null;
  return safeEqual(mac, sign(`${kind}.${id}.${exp}`)) ? { kind, id } : null;
}
