// Admin sessions: a signed token "<expiry>.<hmac>" kept in the admin's browser.
import crypto from "node:crypto";

const TTL_MS = 12 * 60 * 60 * 1000;

function sign(value) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(value).digest("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && safeEqual(password || "", expected);
}

export function issueToken() {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  const [exp, mac] = token.split(".");
  if (!exp || !mac || Number(exp) < Date.now()) return false;
  return safeEqual(mac, sign(exp));
}
