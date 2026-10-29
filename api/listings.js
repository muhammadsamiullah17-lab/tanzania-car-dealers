// GET /api/listings            -> approved ads (featured first) and dealers (paid packages first)
// GET /api/listings?id=<ad id> -> one approved ad with its dealer
// A car is Featured if it has Featured days left, or its dealer has an active Gold package.
import { ads, dealers, publicAd, send } from "../lib/store.js";
import { dealerTier } from "../lib/payments.js";
import { getSite, publicSite } from "../lib/site.js";

const TIER_ORDER = { gold: 0, silver: 1 };

function publicDealer(d) {
  const { memberId, ...rest } = d;
  return { ...rest, tier: dealerTier(d) };
}

function withFeatured(ad, dealersById) {
  const p = publicAd(ad);
  const d = ad.dealerId && dealersById[ad.dealerId];
  if (d && d.tier === "gold") p.featured = true;
  return p;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
  try {
    const id = req.query.id;
    if (id) {
      if (!/^[a-f0-9]{16}$/.test(id)) return send(res, 404, { error: "Not found" });
      const ad = await ads.get(id);
      if (!ad || !["approved", "sold"].includes(ad.status)) return send(res, 404, { error: "Not found" });
      const dealer = ad.dealerId ? await dealers.get(ad.dealerId) : null;
      const pd = dealer ? publicDealer(dealer) : null;
      res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
      return send(res, 200, { ad: withFeatured(ad, pd ? { [pd.id]: pd } : {}), dealer: pd, site: publicSite(await getSite()) });
    }
    const [allAds, allDealers, site] = await Promise.all([ads.all(), dealers.all(), getSite()]);
    const pubDealers = allDealers.map(publicDealer);
    const byId = Object.fromEntries(pubDealers.map((d) => [d.id, d]));
    const live = allAds.filter((a) => a.status === "approved").map((a) => withFeatured(a, byId))
      .sort((a, b) => (b.featured - a.featured) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    pubDealers.sort((a, b) => ((TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9)) || a.name.localeCompare(b.name));
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    send(res, 200, { ads: live, dealers: pubDealers, site: publicSite(site) });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Could not load listings" });
  }
}
