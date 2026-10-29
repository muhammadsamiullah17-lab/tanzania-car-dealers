// Site-wide content and switches an admin manages in Admin › Site settings:
// who may sell, home page banner photos, notices, and delivery prices across Tanzania.
import { collection, newId, savePhoto, files, photoFileId } from "./store.js";

const store = collection("settings");
const ID = "0000000000000003";

export const DEFAULT_DELIVERY = [
  { city: "Dar es Salaam", price: 0, days: "Same day" },
  { city: "Morogoro", price: 350000, days: "1–2 days" },
  { city: "Dodoma", price: 600000, days: "2–3 days" },
  { city: "Arusha", price: 900000, days: "2–3 days" },
  { city: "Moshi", price: 850000, days: "2–3 days" },
  { city: "Tanga", price: 500000, days: "1–2 days" },
  { city: "Mwanza", price: 1300000, days: "3–4 days" },
  { city: "Mbeya", price: 1100000, days: "3–4 days" },
  { city: "Iringa", price: 750000, days: "2–3 days" },
  { city: "Zanzibar", price: 650000, days: "2–3 days (by ferry)" },
];

export const DEFAULT_SITE = {
  // Private (individual) sellers. Off = only verified car dealers can sign up to sell and post cars.
  privateSellersEnabled: false,
  banners: [], // photo URLs shown in the home page banner
  notices: [], // { id, date, title, text }
  delivery: DEFAULT_DELIVERY, // delivery from Dar es Salaam: { city, price (TZS), days }
  deliveryNote: "Estimated prices by car carrier or driver from our Dar es Salaam yard. Large SUVs and trucks may cost more.",
  updatedAt: null,
  updatedBy: null,
};

export async function getSite() {
  const { id, ...saved } = (await store.get(ID)) || {};
  return { ...DEFAULT_SITE, ...saved };
}

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

// b: fields from the admin form; only fields that are sent are changed.
export async function saveSite(b, by) {
  const cur = await getSite();
  const s = { ...cur, id: ID, updatedAt: new Date().toISOString(), updatedBy: by };
  if (b.privateSellersEnabled !== undefined) s.privateSellersEnabled = Boolean(b.privateSellersEnabled);
  if (Array.isArray(b.notices)) {
    s.notices = b.notices.slice(0, 20).map((n) => ({ id: /^[a-f0-9]{16}$/.test(n.id || "") ? n.id : newId(), date: text(n.date, 10) || new Date().toISOString().slice(0, 10), title: text(n.title, 120), text: text(n.text, 1000) }))
      .filter((n) => n.title);
  }
  if (Array.isArray(b.delivery)) {
    s.delivery = b.delivery.slice(0, 40).map((d) => ({ city: text(d.city, 40), price: Math.max(0, Math.round(Number(d.price) || 0)), days: text(d.days, 40) })).filter((d) => d.city);
  }
  if (b.deliveryNote !== undefined) s.deliveryNote = text(b.deliveryNote, 300);
  if (Array.isArray(b.keepBanners) || Array.isArray(b.newBanners)) {
    const keep = (b.keepBanners || []).filter((u) => cur.banners.includes(u));
    for (const u of cur.banners.filter((u) => !keep.includes(u))) await files.remove(photoFileId(u)).catch(() => {});
    const added = [];
    for (const p of (b.newBanners || []).slice(0, 5 - keep.length)) added.push(await savePhoto("site:banner", p));
    s.banners = keep.concat(added);
  }
  await store.save(s);
  return getSite();
}

// What any visitor's page may know.
export function publicSite(s) {
  return {
    privateSellersEnabled: Boolean(s.privateSellersEnabled),
    banners: s.banners || [],
    notices: (s.notices || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 6),
    delivery: s.delivery || [],
    deliveryNote: s.deliveryNote || "",
  };
}
