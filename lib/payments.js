// Paid packages (Featured ads, dealer packages), how customers pay (Lipa numbers checked by staff,
// or Selcom push-to-phone), orders, and activating what was paid for.
import { collection, ads, dealers, newId } from "./store.js";
import { encryptBuffer, decryptBuffer } from "./secure.js";
import { orderStatus } from "./selcom.js";

const settingsStore = collection("settings");
const SETTINGS_ID = "0000000000000002";
export const orders = collection("orders");

export const NETWORKS = ["M-Pesa", "Mixx by Yas", "Airtel Money", "HaloPesa"];

export const DEFAULT_PAY_SETTINGS = {
  packages: {
    feature: [
      { id: "f7", name: "Featured 7 days", days: 7, price: 10000 },
      { id: "f14", name: "Featured 14 days", days: 14, price: 18000 },
      { id: "f30", name: "Featured 30 days", days: 30, price: 30000 },
    ],
    dealer: [
      { id: "silver", name: "Silver dealer (30 days)", days: 30, price: 50000, tier: "silver" },
      { id: "gold", name: "Gold dealer (30 days)", days: 30, price: 150000, tier: "gold" },
    ],
  },
  lipa: NETWORKS.map((network) => ({ network, number: "", accountName: "", enabled: false })),
  selcom: { enabled: false, vendor: "", baseUrl: "", apiKeyEnc: "", apiSecretEnc: "" },
  updatedAt: null,
  updatedBy: null,
};

export async function getPaySettings() {
  const { id, ...saved } = (await settingsStore.get(SETTINGS_ID)) || {};
  return {
    ...DEFAULT_PAY_SETTINGS, ...saved,
    packages: { ...DEFAULT_PAY_SETTINGS.packages, ...(saved.packages || {}) },
    selcom: { ...DEFAULT_PAY_SETTINGS.selcom, ...(saved.selcom || {}) },
  };
}

const enc = (s) => (s ? encryptBuffer("paykeys", Buffer.from(s, "utf8")).toString("base64") : "");
const dec = (s) => (s ? decryptBuffer("paykeys", Buffer.from(s, "base64")).toString("utf8") : "");

// Selcom credentials: Vercel environment variables win; otherwise what an admin saved (encrypted).
export function selcomCreds(s) {
  const apiKey = process.env.SELCOM_API_KEY || dec(s.selcom.apiKeyEnc);
  const apiSecret = process.env.SELCOM_API_SECRET || dec(s.selcom.apiSecretEnc);
  const vendor = process.env.SELCOM_VENDOR || s.selcom.vendor;
  const baseUrl = (process.env.SELCOM_BASE_URL || s.selcom.baseUrl || "").replace(/\/+$/, "");
  return { apiKey, apiSecret, vendor, baseUrl, ready: Boolean(apiKey && apiSecret && vendor && baseUrl) };
}

// What customers (and the admin page) may see: never the keys.
export function publicPaySettings(s) {
  const c = selcomCreds(s);
  return {
    packages: s.packages,
    lipa: s.lipa.filter((l) => l.enabled && l.number).map(({ network, number, accountName }) => ({ network, number, accountName })),
    selcom: { available: Boolean(s.selcom.enabled && c.ready) },
  };
}

export function adminPaySettings(s) {
  const c = selcomCreds(s);
  const { apiKeyEnc, apiSecretEnc, ...selcom } = s.selcom;
  return { ...s, selcom: { ...selcom, apiKeySaved: Boolean(apiKeyEnc), apiSecretSaved: Boolean(apiSecretEnc), fromEnv: Boolean(process.env.SELCOM_API_KEY), ready: c.ready } };
}

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}
function price(v) {
  const n = Math.round(Number(v));
  if (!(n >= 0 && n <= 1e9)) throw Object.assign(new Error("Check the package prices."), { status: 400 });
  return n;
}

// b: settings from the admin form. Keys are only replaced when a new value is typed; canKeys = admin role.
export async function savePaySettings(b, by, canKeys) {
  const cur = await getPaySettings();
  const pkg = (list, fallback) => (Array.isArray(list) ? list : fallback).slice(0, 6).map((p, i) => ({
    id: fallback[i] ? fallback[i].id : text(p.id, 20) || "p" + i,
    name: text(p.name, 60) || fallback[i]?.name || "Package",
    days: Math.max(1, Math.min(365, Math.round(Number(p.days) || 30))),
    price: price(p.price),
    ...(fallback[i] && fallback[i].tier ? { tier: fallback[i].tier } : {}),
  }));
  const s = {
    id: SETTINGS_ID,
    packages: { feature: pkg(b.packages?.feature, cur.packages.feature), dealer: pkg(b.packages?.dealer, cur.packages.dealer) },
    lipa: NETWORKS.map((network) => {
      const l = (b.lipa || []).find((x) => x.network === network) || {};
      return { network, number: text(l.number, 30), accountName: text(l.accountName, 80), enabled: Boolean(l.enabled) && Boolean(text(l.number, 30)) };
    }),
    selcom: { ...cur.selcom },
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
  if (canKeys && b.selcom) {
    s.selcom.enabled = Boolean(b.selcom.enabled);
    s.selcom.vendor = text(b.selcom.vendor, 60);
    s.selcom.baseUrl = text(b.selcom.baseUrl, 200);
    if (s.selcom.baseUrl && !/^https:\/\//.test(s.selcom.baseUrl)) throw Object.assign(new Error("The Selcom base URL must start with https://"), { status: 400 });
    if (b.selcom.apiKey) s.selcom.apiKeyEnc = enc(text(b.selcom.apiKey, 500));
    if (b.selcom.apiSecret) s.selcom.apiSecretEnc = enc(text(b.selcom.apiSecret, 500));
    if (b.selcom.clearKeys) { s.selcom.apiKeyEnc = ""; s.selcom.apiSecretEnc = ""; s.selcom.enabled = false; }
  }
  await settingsStore.save(s);
  return getPaySettings();
}

export function findPackage(s, type, id) {
  return (s.packages[type] || []).find((p) => p.id === id) || null;
}

export function newOrder(fields) {
  const id = newId();
  return { id, ref: "TCD-" + id.slice(0, 6).toUpperCase(), status: "pending", createdAt: new Date().toISOString(), ...fields };
}

// Applies what an order paid for, once. Featured days and dealer packages stack on top of time left.
export async function activateOrder(order, by) {
  if (order.status === "activated") return order;
  const extend = (until, days) => new Date(Math.max(Date.now(), until ? new Date(until).getTime() : 0) + days * 864e5).toISOString();
  if (order.type === "feature") {
    const ad = await ads.get(order.adId);
    if (!ad) throw Object.assign(new Error("The car for this order no longer exists."), { status: 400 });
    ad.featuredUntil = extend(ad.featuredUntil, order.days);
    ad.updatedAt = new Date().toISOString();
    ad.updatedBy = by;
    await ads.save(ad);
    order.activeUntil = ad.featuredUntil;
  } else if (order.type === "dealer") {
    const d = await dealers.get(order.dealerId);
    if (!d) throw Object.assign(new Error("The dealer page for this order no longer exists."), { status: 400 });
    const sameTier = d.packageTier === order.tier && d.packageUntil && new Date(d.packageUntil) > new Date();
    d.packageTier = order.tier;
    d.packageUntil = extend(sameTier ? d.packageUntil : null, order.days);
    d.updatedAt = new Date().toISOString();
    await dealers.save(d);
    order.activeUntil = d.packageUntil;
  }
  order.status = "activated";
  order.activatedAt = new Date().toISOString();
  order.activatedBy = by;
  await orders.save(order);
  return order;
}

export function dealerTier(d, now = Date.now()) {
  return d && d.packageTier && d.packageUntil && new Date(d.packageUntil).getTime() > now ? d.packageTier : null;
}

const FAILED = ["CANCELLED", "USERCANCELLED", "REJECTED"];

// Asks Selcom about a Selcom order and activates or fails it. Safe to call many times.
export async function refreshSelcom(order, s) {
  if (order.method !== "selcom" || ["activated", "failed", "cancelled", "rejected"].includes(order.status)) return order;
  const creds = selcomCreds(s);
  if (!creds.ready) return order;
  const st = await orderStatus(creds, order.id);
  order.selcom = { ...(order.selcom || {}), status: st.status, transid: st.row.transid || order.selcom?.transid, reference: st.row.reference || null, channel: st.row.channel || null, checkedAt: new Date().toISOString() };
  if (st.status === "COMPLETED") {
    order.status = "paid";
    order.paidAt = new Date().toISOString();
    await orders.save(order);
    return activateOrder(order, "selcom");
  }
  if (FAILED.includes(st.status)) order.status = "failed";
  await orders.save(order);
  return order;
}

