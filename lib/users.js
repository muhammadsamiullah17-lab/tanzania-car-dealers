// Staff accounts (admin, manager, staff). Records are encrypted; passwords inside are scrypt hashes.
import { newId, collection } from "./store.js";
import { jsonCodec, hashPassword } from "./secure.js";

export { checkNewPassword, hashPassword, verifyPassword } from "./secure.js";

// admin: everything. manager: verify customer accounts, ads, dealers. staff: ads and dealers.
export const ROLES = ["admin", "manager", "staff"];

export const users = {
  ...collection("users/", jsonCodec("users")),
  async byUsername(username) {
    return (await users.all()).find((u) => u.username === username) || null;
  },
};

export function cleanUsername(v) {
  const u = String(v || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw new Error("ID must be 3 to 30 characters: letters, numbers, dot, dash or underscore.");
  if (/^\+?\d+$/.test(u)) throw new Error("Staff IDs can't be only numbers (that is how customers log in).");
  return u;
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
