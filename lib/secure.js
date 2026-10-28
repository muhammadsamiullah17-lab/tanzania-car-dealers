// Encryption and password helpers. The Blob store is public, so anything personal (accounts,
// ID documents) is encrypted with AES-256-GCM using a key derived from SESSION_SECRET + a purpose.
import crypto from "node:crypto";

function key(purpose) {
  return crypto.createHash("sha256").update(purpose + ":" + (process.env.SESSION_SECRET || "")).digest();
}

export function encryptBuffer(purpose, buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(purpose), iv);
  const data = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]);
}

export function decryptBuffer(purpose, box) {
  const d = crypto.createDecipheriv("aes-256-gcm", key(purpose), box.subarray(0, 12));
  d.setAuthTag(box.subarray(12, 28));
  return Buffer.concat([d.update(box.subarray(28)), d.final()]);
}

// JSON records: same cipher, stored as a small JSON envelope.
export function jsonCodec(purpose) {
  return {
    encode(obj) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key(purpose), iv);
      const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
      return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
    },
    decode(text) {
      const box = JSON.parse(text);
      const d = crypto.createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(box.iv, "base64"));
      d.setAuthTag(Buffer.from(box.tag, "base64"));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data, "base64")), d.final()]).toString("utf8"));
    },
  };
}

export function checkNewPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) throw new Error("Password must be at least 8 characters.");
  if (pw.length > 200) throw new Error("Password is too long.");
  return pw;
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${crypto.scryptSync(pw, salt, 64).toString("base64")}`;
}

export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored || "").split("$");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = crypto.scryptSync(String(pw || ""), Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
