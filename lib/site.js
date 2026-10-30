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
  // Our own company in Japan: every Japan order, bid, offer and "find me a car" goes to it, never to a Tanzanian dealer.
  japanCompany: { name: "", licence: "", address: "", contactPerson: "", phone: "", whatsapp: "", email: "", website: "", about: "" },
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
    s.notices = b.notices.slice(0, 20).map((n) => ({ id: /^[a-f0-9]{16}$/.test(n.id || "") ? n.id : newId(), date: text(n.date, 10) || new Date().toISOString().slice(0, 10), title: text(n.title, 120), text: text(n.text, 1000), important: Boolean(n.important) }))
      .filter((n) => n.title);
  }
  if (Array.isArray(b.delivery)) {
    s.delivery = b.delivery.slice(0, 40).map((d) => ({ city: text(d.city, 40), price: Math.max(0, Math.round(Number(d.price) || 0)), days: text(d.days, 40) })).filter((d) => d.city);
  }
  if (b.deliveryNote !== undefined) s.deliveryNote = text(b.deliveryNote, 300);
  if (b.japanCompany) {
    const j = b.japanCompany, wa = String(j.whatsapp || "").replace(/\D/g, "");
    if (wa && !/^\d{9,15}$/.test(wa)) throw Object.assign(new Error("The Japan WhatsApp number must be in international format, e.g. +81 90 1234 5678."), { status: 400 });
    if (j.website && !/^https?:\/\//.test(String(j.website).trim())) throw Object.assign(new Error("The website must start with https://"), { status: 400 });
    s.japanCompany = { name: text(j.name, 120), licence: text(j.licence, 200), address: text(j.address, 300), contactPerson: text(j.contactPerson, 80),
      phone: text(j.phone, 40), whatsapp: wa, email: text(j.email, 120), website: text(j.website, 200), about: text(j.about, 1000) };
  }
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

// The public notice board: important notices first, then newest first.
export function noticeBoard(s) {
  return (s.notices || []).slice().sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0) || (b.date || "").localeCompare(a.date || ""));
}

// What any visitor's page may know.
export function publicSite(s) {
  return {
    privateSellersEnabled: Boolean(s.privateSellersEnabled),
    banners: s.banners || [],
    notices: noticeBoard(s).slice(0, 6),
    delivery: s.delivery || [],
    deliveryNote: s.deliveryNote || "",
    japanCompany: { ...DEFAULT_SITE.japanCompany, ...(s.japanCompany || {}) },
  };
}
