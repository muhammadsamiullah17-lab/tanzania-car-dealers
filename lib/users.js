// Admin/staff accounts. The Blob store is public, so each user record is encrypted with a key
// derived from SESSION_SECRET, and passwords inside are scrypt hashes.
import crypto from "node:crypto";
import { newId, collection } from "./store.js";

export const ROLES = ["admin", "staff"];

function key() {
  return crypto.createHash("sha256").update("users:" + (process.env.SESSION_SECRET || "")).digest();
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
}

function decrypt(text) {
  const box = JSON.parse(text);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(box.iv, "base64"));
  d.setAuthTag(Buffer.from(box.tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data, "base64")), d.final()]).toString("utf8"));
}

export const users = {
  ...collection("users/", { encode: encrypt, decode: decrypt }),
  async byUsername(username) {
    return (await users.all()).find((u) => u.username === username) || null;
  },
};

export function cleanUsername(v) {
  const u = String(v || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw new Error("ID must be 3 to 30 characters: letters, numbers, dot, dash or underscore.");
  return u;
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

export function newUser({ username, name, role, password }, createdBy) {
  const now = new Date().toISOString();
  return { id: newId(), username, name: String(name || "").trim().slice(0, 60) || username, role, active: true,
    passwordHash: hashPassword(password), createdAt: now, updatedAt: now, createdBy: createdBy || null, lastLoginAt: null };
}

// What the admin page may see about a user (never the password hash).
export function publicUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}
