// Data lives in Vercel Blob. Public blob URLs are cached by the CDN for several seconds after an
// overwrite, so records are never overwritten: every save writes a new version
// (<prefix><id>/<timestamp>-<random>.json) and deletes the older ones. The newest version is found
// with list(), which is always current, and its unique URL is never stale.
import { put, list, del } from "@vercel/blob";
import crypto from "node:crypto";

export function newId() {
  return crypto.randomBytes(8).toString("hex");
}

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

// A store of records keyed by id. encode/decode let users.js encrypt its records.
export function collection(prefix, { encode = JSON.stringify, decode = JSON.parse } = {}) {
  const idOf = (b) => b.pathname.slice(prefix.length).split("/")[0];
  const newest = (blobs) => blobs.reduce((a, b) => (!a || b.pathname > a.pathname ? b : a), null);
  async function read(blob) {
    const r = await fetch(blob.url);
    return r.ok ? decode(await r.text()) : null;
  }
  return {
    async all() {
      const byId = new Map();
      for (const b of await listAll(prefix)) {
        if (!b.pathname.endsWith(".json")) continue;
        const id = idOf(b), cur = byId.get(id);
        if (!cur || b.pathname > cur.pathname) byId.set(id, b);
      }
      return (await Promise.all([...byId.values()].map((b) => read(b).catch(() => null)))).filter(Boolean);
    },
    async get(id) {
      if (!/^[a-f0-9]{16}$/.test(id || "")) return null;
      const latest = newest(await listAll(`${prefix}${id}/`));
      return latest ? read(latest) : null;
    },
    async save(rec) {
      const saved = await put(`${prefix}${rec.id}/${String(Date.now()).padStart(15, "0")}.json`, encode(rec),
        { access: "public", contentType: "application/json", addRandomSuffix: true });
      const old = (await listAll(`${prefix}${rec.id}/`)).filter((b) => b.url !== saved.url && b.pathname < saved.pathname);
      if (old.length) await del(old.map((b) => b.url)).catch(() => {});
      return saved;
    },
    async remove(id) {
      const versions = await listAll(`${prefix}${id}/`);
      if (versions.length) await del(versions.map((b) => b.url));
    },
  };
}

const adStore = collection("ads/");
export const ads = {
  ...adStore,
  async remove(ad) {
    await adStore.remove(ad.id);
    if (ad.photos && ad.photos.length) await del(ad.photos);
  },
};

export const dealers = collection("dealers/");

export async function savePhoto(adId, index, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("Photos must be JPEG, PNG or WebP images.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 900 * 1024) throw new Error("A photo is too large.");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const blob = await put(`photos/${adId}/${index}.${ext}`, buf, { access: "public", contentType: `image/${m[1]}` });
  return blob.url;
}

export function isFeatured(ad, now = Date.now()) {
  return Boolean(ad.featuredUntil && new Date(ad.featuredUntil).getTime() > now);
}

// Public view of an ad: drops admin-only fields.
export function publicAd(ad) {
  const { adminNote, ...rest } = ad;
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
