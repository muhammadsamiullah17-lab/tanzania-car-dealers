// GET /api/listings            -> approved ads (featured first) and dealers
// GET /api/listings?id=<ad id> -> one approved ad with its dealer
import { ads, dealers, publicAd, sortListings, send } from "../lib/store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try {
    const id = req.query.id;
    if (id) {
      if (!/^[a-f0-9]{16}$/.test(id)) return send(res, 404, { error: "Not found" });
      const ad = await ads.get(id);
      if (!ad || !["approved", "sold"].includes(ad.status)) return send(res, 404, { error: "Not found" });
      const dealer = ad.dealerId ? await dealers.get(ad.dealerId) : null;
      res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
      return send(res, 200, { ad: publicAd(ad), dealer });
    }
    const [allAds, allDealers] = await Promise.all([ads.all(), dealers.all()]);
    const live = sortListings(allAds.filter((a) => a.status === "approved")).map(publicAd);
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    send(res, 200, { ads: live, dealers: allDealers.sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Could not load listings" });
  }
}
