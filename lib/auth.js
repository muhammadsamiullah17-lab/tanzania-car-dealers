// Sessions: a signed token "<user id>.<expiry>.<hmac>" kept in the browser.
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

export function issueToken(userId) {
  const body = `${userId}.${Date.now() + TTL_MS}`;
  return `${body}.${sign(body)}`;
}

// Returns the user id from a valid, unexpired token, or null.
export function tokenUserId(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const [uid, exp, mac] = token.split(".");
  if (!uid || !exp || !mac || Number(exp) < Date.now()) return null;
  return safeEqual(mac, sign(`${uid}.${exp}`)) ? uid : null;
}
