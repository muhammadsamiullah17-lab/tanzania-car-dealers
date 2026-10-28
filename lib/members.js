// Customer accounts (private sellers and car dealers). Every member must be verified by a
// manager or admin (documents checked + phone confirmed) before they can post ads.
// Records and uploaded documents are encrypted because they hold ID data.
import { put, del } from "@vercel/blob";
import { newId, collection, digits } from "./store.js";
import { jsonCodec, encryptBuffer, decryptBuffer, hashPassword } from "./secure.js";

// incomplete: signed up, documents not submitted yet. review: waiting for staff.
// verified: may post ads. rejected: must fix and resubmit. suspended: blocked by staff.
export const STATUSES = ["incomplete", "review", "verified", "rejected", "suspended"];
export const ID_TYPES = ["NIDA (National ID)", "Passport", "Driving licence", "Voter ID"];

export const DOC_KINDS = {
  private: [
    { kind: "id_front", label: "ID card or passport (photo page)", required: true },
    { kind: "id_back", label: "Back of ID card", required: false },
    { kind: "selfie", label: "Selfie holding your ID", required: true },
  ],
  dealer: [
    { kind: "business_licence", label: "Business licence", required: true },
    { kind: "tin_certificate", label: "TIN certificate", required: true },
    { kind: "brela_certificate", label: "BRELA certificate of registration", required: false },
    { kind: "owner_id", label: "Owner / manager ID card or passport", required: true },
    { kind: "selfie", label: "Selfie of owner / manager holding their ID", required: true },
  ],
};

export const members = {
  ...collection("members/", jsonCodec("members")),
  async byPhone(phone) {
    return (await members.all()).find((m) => m.phone === phone) || null;
  },
};

export function cleanPhone(v) {
  const p = digits(v);
  if (!/^255[67]\d{8}$/.test(p)) throw new Error("Enter a Tanzanian mobile number, e.g. 0712 345 678.");
  return p;
}

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

// Profile fields a member may set (only while not yet verified).
export function profileFields(type, b) {
  const p = {
    fullName: text(b.fullName, 80),
    city: text(b.city, 40),
    email: text(b.email, 120),
    idType: ID_TYPES.includes(b.idType) ? b.idType : "",
    idNumber: text(b.idNumber, 40),
  };
  if (!p.fullName) throw new Error("Please enter your full name.");
  if (type === "dealer") {
    p.business = {
      name: text(b.businessName, 100),
      tin: text(b.tin, 30),
      licenceNo: text(b.licenceNo, 40),
      brelaNo: text(b.brelaNo, 40),
      address: text(b.address, 160),
    };
    if (!p.business.name) throw new Error("Please enter the business name.");
  }
  return p;
}

export function newMember(type, phone, password, profile) {
  const now = new Date().toISOString();
  return { id: newId(), type, phone, passwordHash: hashPassword(password), status: "incomplete", ...profile, docs: [],
    phoneVerified: false, docsChecked: false, notes: [], dealerId: null, createdAt: now, updatedAt: now, lastLoginAt: now };
}

// What is still missing before the member can submit for review.
export function missing(m) {
  const out = [];
  if (!m.fullName) out.push("full name");
  if (!m.city) out.push("city");
  if (!m.idType || !m.idNumber) out.push("ID type and number");
  if (m.type === "dealer" && (!m.business || !m.business.tin || !m.business.licenceNo || !m.business.address)) out.push("business TIN, licence number and address");
  DOC_KINDS[m.type].filter((d) => d.required && !m.docs.some((x) => x.kind === d.kind)).forEach((d) => out.push(d.label));
  return out;
}

// The member's own view: no password hash, no internal staff notes.
export function selfView(m) {
  const { passwordHash, notes, ...rest } = m;
  return { ...rest, missing: missing(m) };
}

export function staffView(m) {
  const { passwordHash, ...rest } = m;
  return { ...rest, missing: missing(m) };
}

const MAX_DOC = 3 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function saveDoc(member, kind, dataUrl, name) {
  if (!DOC_KINDS[member.type].some((d) => d.kind === kind)) throw new Error("Unknown document type.");
  const m = /^data:([a-z]+\/[a-z.+-]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m || !TYPES[m[1]]) throw new Error("Documents must be a photo (JPG, PNG) or a PDF.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_DOC) throw new Error("That file is too large (max 3 MB). Take a photo instead of a scan.");
  const blob = await put(`docs/${member.id}/${kind}.bin`, encryptBuffer("docs", buf), { access: "public", contentType: "application/octet-stream", addRandomSuffix: true });
  const old = member.docs.filter((d) => d.kind === kind);
  member.docs = member.docs.filter((d) => d.kind !== kind).concat({
    id: newId(), kind, name: text(name, 120) || kind + "." + TYPES[m[1]], contentType: m[1], size: buf.length, url: blob.url, uploadedAt: new Date().toISOString(),
  });
  if (old.length) await del(old.map((d) => d.url)).catch(() => {});
}

export async function readDoc(doc) {
  const r = await fetch(doc.url);
  if (!r.ok) throw new Error("Document not found");
  return decryptBuffer("docs", Buffer.from(await r.arrayBuffer()));
}

export async function removeMember(m) {
  const urls = (m.docs || []).map((d) => d.url);
  if (urls.length) await del(urls).catch(() => {});
  await members.remove(m.id);
}
