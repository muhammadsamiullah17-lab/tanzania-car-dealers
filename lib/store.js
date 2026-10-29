// Records (ads, dealers, staff users, members) and files (photos, documents) live in Postgres;
// see db.js for the tables.
import crypto from "node:crypto";
import { db } from "./db.js";

export function newId() {
  return crypto.randomBytes(8).toString("hex");
}

// A store of records of one kind, keyed by id. encode/decode let users.js and members.js encrypt.
export function collection(kind, { encode = JSON.stringify, decode = JSON.parse } = {}) {
  kind = kind.replace(/\/$/, "");
  return {
    async all() {
      const q = await db();
      const rows = await q`SELECT data FROM tcd_records WHERE kind = ${kind}`;
      return rows.map((r) => { try { return decode(r.data); } catch { return null; } }).filter(Boolean);
    },
    async get(id) {
      if (!/^[a-f0-9]{16}$/.test(id || "")) return null;
      const q = await db();
      const rows = await q`SELECT data FROM tcd_records WHERE kind = ${kind} AND id = ${id}`;
      return rows.length ? decode(rows[0].data) : null;
    },
    async save(rec) {
      const q = await db();
      await q`INSERT INTO tcd_records (kind, id, data) VALUES (${kind}, ${rec.id}, ${encode(rec)})
        ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
    },
    async remove(id) {
      const q = await db();
      await q`DELETE FROM tcd_records WHERE kind = ${kind} AND id = ${id}`;
    },
  };
}

export const files = {
  // Stores bytes and returns the new file id.
  async put(owner, contentType, buf, isPublic) {
    const id = newId(), q = await db();
    await q`INSERT INTO tcd_files (id, owner, content_type, public, data)
      VALUES (${id}, ${owner}, ${contentType}, ${isPublic}, decode(${buf.toString("base64")}, 'base64'))`;
    return id;
  },
  async get(id) {
    if (!/^[a-f0-9]{16}$/.test(id || "")) return null;
    const q = await db();
    const rows = await q`SELECT content_type, public, encode(data, 'base64') AS b64 FROM tcd_files WHERE id = ${id}`;
    return rows.length ? { contentType: rows[0].content_type, public: rows[0].public, buf: Buffer.from(rows[0].b64, "base64") } : null;
  },
  async remove(id) {
    const q = await db();
    await q`DELETE FROM tcd_files WHERE id = ${id}`;
  },
  async removeOwner(owner) {
    const q = await db();
    await q`DELETE FROM tcd_files WHERE owner = ${owner}`;
  },
};

const adStore = collection("ads");
export const ads = {
  ...adStore,
  async remove(ad) {
    await adStore.remove(ad.id);
    await files.removeOwner("ad:" + ad.id);
  },
};

export const dealers = collection("dealers");

// Saves one public car photo for an owner ("ad:<id>" or "jcar:<id>") and returns its URL.
export async function savePhoto(owner, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("Photos must be JPEG, PNG or WebP images.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 900 * 1024) throw new Error("A photo is too large.");
  const id = await files.put(owner, `image/${m[1]}`, buf, true);
  return `/api/photo?id=${id}`;
}

export function photoFileId(url) {
  const m = /^\/api\/photo\?id=([a-f0-9]{16})$/.exec(url || "");
  return m ? m[1] : null;
}

export function isFeatured(ad, now = Date.now()) {
  return Boolean(ad.featuredUntil && new Date(ad.featuredUntil).getTime() > now);
}

// Public view of an ad: drops admin-only fields.
export function publicAd(ad) {
  const { adminNote, memberId, approvedBy, updatedBy, ...rest } = ad;
  return { ...rest, featured: isFeatured(ad) };
}

export function sortListings(list) {
  const now = Date.now();
  return list.sort((a, b) => (isFeatured(b, now) - isFeatured(a, now)) || (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export function digits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "255" + d.slice(1);
  return d;
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}
