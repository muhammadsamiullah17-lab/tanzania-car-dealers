// GET /api/photo?id=<file id> -> a public car photo. Photo ids never change, so browsers and
// Vercel's CDN may cache them for a year. Private files (ID documents) are never served here.
import { files, send } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try {
    const f = await files.get(req.query.id);
    if (!f || !f.public) return send(res, 404, { error: "Not found" });
    res.statusCode = 200;
    res.setHeader("Content-Type", f.contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(f.buf);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Could not load photo" });
  }
}
