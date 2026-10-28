// Data lives in Vercel Blob: one JSON file per ad (ads/<id>.json) and per dealer (dealers/<id>.json).
// Reads skip the Blob CDN cache so approvals show at once; the API responses are cached briefly instead.
import { put, list, get, del } from "@vercel/blob";
import crypto from "node:crypto";

const JSON_OPTS = { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };

export function newId() {
  return crypto.randomBytes(8).toString("hex");
}

async function readJson(pathname) {
  const res = await get(pathname, { access: "public", useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return JSON.parse(await new Response(res.stream).text());
}

async function readAll(prefix) {
  const paths = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    page.blobs.forEach((b) => b.pathname.endsWith(".json") && paths.push(b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const items = await Promise.all(paths.map((p) => readJson(p).catch(() => null)));
  return items.filter(Boolean);
}

export const ads = {
  all: () => readAll("ads/"),
  get: (id) => readJson(`ads/${id}.json`),
  save: (ad) => put(`ads/${ad.id}.json`, JSON.stringify(ad), JSON_OPTS),
  async remove(ad) {
    const urls = (ad.photos || []).slice();
    await del(`ads/${ad.id}.json`);
    if (urls.length) await del(urls);
  },
};

export const dealers = {
  all: () => readAll("dealers/"),
  get: (id) => readJson(`dealers/${id}.json`),
  save: (d) => put(`dealers/${d.id}.json`, JSON.stringify(d), JSON_OPTS),
  remove: (id) => del(`dealers/${id}.json`),
};

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
