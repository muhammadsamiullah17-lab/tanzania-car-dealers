// Import from Japan: cars staff source from Japanese auctions/stock, the rates used to estimate the
// landed cost in Dar es Salaam, and buyers' "find me a car" requests.
import { collection } from "./store.js";

export const jcars = collection("jcars");
export const jrequests = collection("jrequests");
const settingsStore = collection("settings");
const SETTINGS_ID = "0000000000000001";

export const SALE_TYPES = ["stock", "auction"];
export const JSTATUSES = ["available", "reserved", "sold", "hidden"];
export const REQUEST_STATUSES = ["new", "contacted", "ordered", "closed"];

// Defaults from TRA "Taxes and Duties at a Glance 2025/26" and the Finance Act 2026 (from 1 July 2026).
// Staff can change every value in Admin > Import settings; TRA's own assessment is always final.
export const DEFAULT_SETTINGS = {
  tzsPerUsd: 2550,
  jpyPerUsd: 156,
  freightUsd: { small: 1100, medium: 1300, large: 1600, xl: 2300 },
  insurancePct: 1.5,
  importDutyPct: 25,
  engineExcise: [{ maxCc: 2000, pct: 5 }, { maxCc: null, pct: 10 }],
  ageExcise: [{ maxAge: 7, pct: 0 }, { maxAge: 10, pct: 18 }, { maxAge: 20, pct: 35 }, { maxAge: null, pct: 40 }],
  vatPct: 18,
  rdlPct: 2,
  cpfPct: 0.6,
  registrationTzs: 650000,
  clearingTzs: 0,
  serviceFeeTzs: 0,
  updatedAt: null,
  updatedBy: null,
};

export async function getSettings() {
  const { id, ...saved } = (await settingsStore.get(SETTINGS_ID)) || {};
  return { ...DEFAULT_SETTINGS, ...saved };
}

function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error("Please check the numbers in the import settings.");
  return n;
}

export async function saveSettings(b, by) {
  const s = {
    id: SETTINGS_ID,
    tzsPerUsd: num(b.tzsPerUsd, 100, 100000),
    jpyPerUsd: num(b.jpyPerUsd, 10, 1000),
    freightUsd: {
      small: num(b.freightUsd && b.freightUsd.small, 0, 20000),
      medium: num(b.freightUsd && b.freightUsd.medium, 0, 20000),
      large: num(b.freightUsd && b.freightUsd.large, 0, 20000),
      xl: num(b.freightUsd && b.freightUsd.xl, 0, 50000),
    },
    insurancePct: num(b.insurancePct, 0, 20),
    importDutyPct: num(b.importDutyPct, 0, 100),
    engineExcise: (b.engineExcise || []).slice(0, 6).map((r, i, a) => ({ maxCc: i === a.length - 1 ? null : num(r.maxCc, 1, 20000), pct: num(r.pct, 0, 100) })),
    ageExcise: (b.ageExcise || []).slice(0, 8).map((r, i, a) => ({ maxAge: i === a.length - 1 ? null : num(r.maxAge, 0, 100), pct: num(r.pct, 0, 100) })),
    vatPct: num(b.vatPct, 0, 50),
    rdlPct: num(b.rdlPct, 0, 20),
    cpfPct: num(b.cpfPct, 0, 20),
    registrationTzs: num(b.registrationTzs, 0, 1e9),
    clearingTzs: num(b.clearingTzs, 0, 1e9),
    serviceFeeTzs: num(b.serviceFeeTzs, 0, 1e10),
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
  if (!s.engineExcise.length || !s.ageExcise.length) throw new Error("Excise bands can't be empty.");
  await settingsStore.save(s);
  return getSettings();
}

// Public view of a Japan car: drops where staff bought it and internal notes.
export function publicJcar(c) {
  const { source, internalNote, ...rest } = c;
  return rest;
}
