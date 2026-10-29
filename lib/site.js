// Site-wide switches an admin can change in Admin › Site settings.
import { collection } from "./store.js";

const store = collection("settings");
const ID = "0000000000000003";

export const DEFAULT_SITE = {
  // Private (individual) sellers. Off = only verified car dealers can sign up to sell and post cars.
  privateSellersEnabled: false,
  updatedAt: null,
  updatedBy: null,
};

export async function getSite() {
  const { id, ...saved } = (await store.get(ID)) || {};
  return { ...DEFAULT_SITE, ...saved };
}

export async function saveSite(b, by) {
  const cur = await getSite();
  const s = {
    id: ID,
    privateSellersEnabled: b.privateSellersEnabled === undefined ? cur.privateSellersEnabled : Boolean(b.privateSellersEnabled),
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
  await store.save(s);
  return getSite();
}

// What any visitor's page may know.
export function publicSite(s) {
  return { privateSellersEnabled: Boolean(s.privateSellersEnabled) };
}
