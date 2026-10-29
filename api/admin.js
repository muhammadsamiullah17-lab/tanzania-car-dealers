// POST /api/admin { action, ... } for staff. Logging in happens in /api/account (one login for all).
// "status" and "setup" are open; everything else needs a logged-in, active staff user.
// Each action lists the roles allowed to run it (default: all staff roles).
import { ads, dealers, files, newId, digits, sortListings, savePhoto, photoFileId, readBody, send } from "../lib/store.js";
import { checkSetupKey, issueToken, readToken } from "../lib/auth.js";
import { users, ROLES, cleanUsername, checkNewPassword, hashPassword, verifyPassword, newUser, publicUser } from "../lib/users.js";
import { members, staffView, readDoc, removeMember } from "../lib/members.js";
import { jcars, jrequests, getSettings, saveSettings, SALE_TYPES, JSTATUSES, REQUEST_STATUSES } from "../lib/japan.js";
import { alerts, reports, inspectionFields } from "../lib/buyers.js";
import { orders, getPaySettings, adminPaySettings, savePaySettings, activateOrder, refreshSelcom } from "../lib/payments.js";

const BODIES = ["Hatchback", "Sedan", "Wagon", "Coupe", "SUV", "MiniVan", "Van", "Pickup", "Truck", "Bus", "Other"];

const STATUSES = ["pending", "approved", "rejected", "sold"];
const ADMIN = ["admin"];
const VERIFIERS = ["admin", "manager"];

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function activeAdmins(list) {
  return list.filter((u) => u.role === "admin" && u.active);
}

const open = {
  async status() {
    return { needsSetup: (await users.all()).length === 0 };
  },

  // Creates the very first admin account. Needs the setup key (ADMIN_PASSWORD) and only works once.
  async setup(b) {
    if ((await users.all()).length) throw fail("An admin account already exists. Please log in.", 409);
    if (!checkSetupKey(b.setupKey)) throw fail("Wrong setup key.", 401);
    const user = newUser({ username: cleanUsername(b.username), name: b.name, role: "admin", password: checkNewPassword(b.password) });
    user.lastLoginAt = user.createdAt;
    await users.save(user);
    return { token: issueToken("s", user.id), kind: "s", user: publicUser(user) };
  },
};

const actions = {
  me: { run: async (b, me) => ({ user: publicUser(me) }) },

  changePassword: {
    async run(b, me) {
      if (!verifyPassword(b.currentPassword, me.passwordHash)) throw fail("Your current password is wrong.");
      me.passwordHash = hashPassword(checkNewPassword(b.newPassword));
      me.updatedAt = new Date().toISOString();
      await users.save(me);
      return { ok: true };
    },
  },

  listAds: { run: async () => ({ ads: sortListings(await ads.all()) }) },

  updateAd: {
    async run(b, me) {
      const ad = await ads.get(b.id);
      if (!ad) throw fail("Ad not found", 404);
      if (b.status !== undefined) {
        if (!STATUSES.includes(b.status)) throw fail("Bad status");
        ad.status = b.status;
        if (b.status === "approved" && !ad.approvedAt) {
          ad.approvedAt = new Date().toISOString();
          ad.approvedBy = me.username;
        }
      }
      if (b.featureDays !== undefined) {
        const days = Number(b.featureDays);
        ad.featuredUntil = days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null;
      }
      if (b.dealerId !== undefined) ad.dealerId = b.dealerId || null;
      if (b.price !== undefined && Number(b.price) > 0) ad.price = Number(b.price);
      if (b.adminNote !== undefined) ad.adminNote = text(b.adminNote, 500);
      ad.updatedAt = new Date().toISOString();
      ad.updatedBy = me.username;
      await ads.save(ad);
      return { ad };
    },
  },

  deleteAd: {
    roles: VERIFIERS,
    async run(b) {
      const ad = await ads.get(b.id);
      if (ad) await ads.remove(ad);
      return { ok: true };
    },
  },

  listDealers: { run: async () => ({ dealers: (await dealers.all()).sort((a, b) => a.name.localeCompare(b.name)) }) },

  saveDealer: {
    async run(b) {
      const name = text(b.name, 80), whatsapp = digits(b.whatsapp);
      if (!name) throw fail("Dealer name is required");
      if (!/^255\d{9}$/.test(whatsapp)) throw fail("Dealer WhatsApp must be a Tanzanian number");
      const existing = b.id ? await dealers.get(b.id) : null;
      const dealer = {
        id: existing ? existing.id : newId(),
        name,
        whatsapp,
        city: text(b.city, 40),
        address: text(b.address, 160),
        about: text(b.about, 1000),
        verified: Boolean(b.verified),
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await dealers.save(dealer);
      return { dealer };
    },
  },

  deleteDealer: {
    roles: VERIFIERS,
    async run(b) {
      const linked = (await ads.all()).filter((a) => a.dealerId === b.id);
      for (const ad of linked) {
        ad.dealerId = null;
        await ads.save(ad);
      }
      await dealers.remove(b.id);
      return { ok: true };
    },
  },

  listUsers: {
    roles: ADMIN,
    run: async () => ({ users: (await users.all()).map(publicUser).sort((a, b) => a.username.localeCompare(b.username)) }),
  },

  // Create (no id) or edit (with id) a user. On edit, password is optional and resets it.
  saveUser: {
    roles: ADMIN,
    async run(b, me) {
      const all = await users.all();
      const role = ROLES.includes(b.role) ? b.role : "staff";
      if (!b.id) {
        const username = cleanUsername(b.username);
        if (all.some((u) => u.username === username)) throw fail("That ID is already taken.");
        const user = newUser({ username, name: b.name, role, password: checkNewPassword(b.password) }, me.username);
        await users.save(user);
        return { user: publicUser(user) };
      }
      const user = all.find((u) => u.id === b.id);
      if (!user) throw fail("User not found", 404);
      const active = b.active === undefined ? user.active : Boolean(b.active);
      if (user.id === me.id && (role !== "admin" || !active)) throw fail("You can't remove your own admin access.");
      if (user.role === "admin" && user.active && (role !== "admin" || !active) && activeAdmins(all).length <= 1) {
        throw fail("There must always be at least one active admin.");
      }
      user.name = text(b.name, 60) || user.name;
      user.role = role;
      user.active = active;
      if (b.password) user.passwordHash = hashPassword(checkNewPassword(b.password));
      user.updatedAt = new Date().toISOString();
      await users.save(user);
      return { user: publicUser(user) };
    },
  },

  deleteUser: {
    roles: ADMIN,
    async run(b, me) {
      if (b.id === me.id) throw fail("You can't delete your own account.");
      const all = await users.all();
      const user = all.find((u) => u.id === b.id);
      if (!user) return { ok: true };
      if (user.role === "admin" && user.active && activeAdmins(all).length <= 1) throw fail("There must always be at least one active admin.");
      await users.remove(user.id);
      return { ok: true };
    },
  },

  // ---- Customer account verification (managers and admins) ----

  listMembers: {
    roles: VERIFIERS,
    run: async () => ({ members: (await members.all()).map(staffView).sort((a, b) => (b.submittedAt || b.createdAt).localeCompare(a.submittedAt || a.createdAt)) }),
  },

  // Returns one decrypted document so the admin page can show it.
  getDoc: {
    roles: VERIFIERS,
    async run(b) {
      const m = await members.get(b.memberId);
      const doc = m && m.docs.find((d) => d.id === b.docId);
      if (!doc) throw fail("Document not found", 404);
      return { contentType: doc.contentType, name: doc.name, data: (await readDoc(doc)).toString("base64") };
    },
  },

  // Checks, notes and decisions on a member. Verifying needs the phone confirmed and documents checked.
  reviewMember: {
    roles: VERIFIERS,
    async run(b, me) {
      const m = await members.get(b.id);
      if (!m) throw fail("Account not found", 404);
      const now = new Date().toISOString();
      if (b.phoneVerified !== undefined) {
        m.phoneVerified = Boolean(b.phoneVerified);
        m.phoneVerifiedBy = m.phoneVerified ? me.username : null;
        m.phoneVerifiedAt = m.phoneVerified ? now : null;
      }
      if (b.docsChecked !== undefined) {
        m.docsChecked = Boolean(b.docsChecked);
        m.docsCheckedBy = m.docsChecked ? me.username : null;
      }
      if (b.note) m.notes = (m.notes || []).concat({ by: me.username, at: now, text: text(b.note, 1000) });
      if (b.decision) {
        if (b.decision === "verify") {
          if (!m.phoneVerified || !m.docsChecked) throw fail("Confirm the phone number and check the documents before verifying.");
          m.status = "verified";
          m.verifiedBy = me.username;
          m.verifiedAt = now;
          m.reviewMessage = "";
          if (m.type === "dealer" && !m.dealerId) {
            const dealer = { id: newId(), name: m.business.name, whatsapp: m.phone, city: m.city, address: m.business.address || "",
              about: "", verified: true, memberId: m.id, createdAt: now, updatedAt: now };
            await dealers.save(dealer);
            m.dealerId = dealer.id;
          }
        } else if (b.decision === "reject") {
          if (!text(b.message, 500)) throw fail("Write a message telling the customer what to fix.");
          m.status = "rejected";
          m.reviewMessage = text(b.message, 500);
        } else if (b.decision === "suspend") {
          m.status = "suspended";
          m.reviewMessage = text(b.message, 500);
        } else if (b.decision === "reopen") {
          m.status = "review";
        } else throw fail("Unknown decision");
        m.notes = (m.notes || []).concat({ by: me.username, at: now, text: "Decision: " + b.decision + (b.message ? " – " + text(b.message, 500) : "") });
      }
      m.updatedAt = now;
      await members.save(m);
      if (b.decision === "suspend") {
        for (const ad of (await ads.all()).filter((a) => a.memberId === m.id && a.status === "approved")) {
          ad.status = "rejected";
          ad.updatedBy = me.username;
          await ads.save(ad);
        }
      }
      return { member: staffView(m) };
    },
  },

  resetMemberPassword: {
    roles: VERIFIERS,
    async run(b, me) {
      const m = await members.get(b.id);
      if (!m) throw fail("Account not found", 404);
      m.passwordHash = hashPassword(checkNewPassword(b.password));
      m.notes = (m.notes || []).concat({ by: me.username, at: new Date().toISOString(), text: "Password reset by staff" });
      m.updatedAt = new Date().toISOString();
      await members.save(m);
      return { ok: true };
    },
  },

  // ---- Payments: packages, Lipa numbers, Selcom keys, orders ----

  getPaySettings: { roles: VERIFIERS, run: async () => ({ settings: adminPaySettings(await getPaySettings()) }) },

  // Managers can change prices and Lipa numbers; only admins can change Selcom keys.
  savePaySettings: {
    roles: VERIFIERS,
    run: async (b, me) => ({ settings: adminPaySettings(await savePaySettings(b.settings || {}, me.username, me.role === "admin")) }),
  },

  listOrders: { run: async () => ({ orders: (await orders.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }) },

  // Staff checked their phone/statement and the money arrived: activate the package.
  confirmOrder: {
    roles: VERIFIERS,
    async run(b, me) {
      const o = await orders.get(b.id);
      if (!o) throw fail("Order not found", 404);
      if (o.status === "activated") return { order: o };
      if (["cancelled"].includes(o.status)) throw fail("This order was cancelled by the customer.");
      o.status = "paid";
      o.paidAt = new Date().toISOString();
      o.confirmedBy = me.username;
      o.notes = (o.notes || []).concat({ by: me.username, at: o.paidAt, text: "Payment confirmed" + (b.note ? ": " + text(b.note, 300) : "") });
      await orders.save(o);
      return { order: await activateOrder(o, me.username) };
    },
  },

  rejectOrder: {
    roles: VERIFIERS,
    async run(b, me) {
      const o = await orders.get(b.id);
      if (!o) throw fail("Order not found", 404);
      if (o.status === "activated") throw fail("This order is already active.");
      if (!text(b.reason, 300)) throw fail("Write the reason (the customer sees it).");
      o.status = "rejected";
      o.rejectReason = text(b.reason, 300);
      o.notes = (o.notes || []).concat({ by: me.username, at: new Date().toISOString(), text: "Rejected: " + o.rejectReason });
      await orders.save(o);
      return { order: o };
    },
  },

  checkSelcomOrder: {
    async run(b) {
      const o = await orders.get(b.id);
      if (!o) throw fail("Order not found", 404);
      return { order: await refreshSelcom(o, await getPaySettings()) };
    },
  },

  // ---- Trust: inspections, buyer alerts, reports ----

  saveInspection: {
    async run(b, me) {
      const ad = await ads.get(b.id);
      if (!ad) throw fail("Ad not found", 404);
      ad.inspection = inspectionFields(b.inspection || {}, me.username);
      ad.updatedAt = new Date().toISOString();
      ad.updatedBy = me.username;
      await ads.save(ad);
      return { ad };
    },
  },

  removeInspection: {
    roles: VERIFIERS,
    async run(b, me) {
      const ad = await ads.get(b.id);
      if (!ad) throw fail("Ad not found", 404);
      delete ad.inspection;
      ad.updatedAt = new Date().toISOString();
      ad.updatedBy = me.username;
      await ads.save(ad);
      return { ad };
    },
  },

  listAlerts: { run: async () => ({ alerts: (await alerts.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }) },

  // notifiedAdIds: cars we just sent this buyer on WhatsApp, so they aren't suggested again.
  updateAlert: {
    async run(b, me) {
      const a = await alerts.get(b.id);
      if (!a) throw fail("Alert not found", 404);
      if (Array.isArray(b.notifiedAdIds)) a.notified = Array.from(new Set((a.notified || []).concat(b.notifiedAdIds.map(String)))).slice(-500);
      if (b.active !== undefined) a.active = Boolean(b.active);
      a.lastNotifiedAt = Array.isArray(b.notifiedAdIds) ? new Date().toISOString() : a.lastNotifiedAt;
      a.updatedBy = me.username;
      await alerts.save(a);
      return { alert: a };
    },
  },

  deleteAlert: { roles: VERIFIERS, run: async (b) => { await alerts.remove(b.id); return { ok: true }; } },

  listReports: { run: async () => ({ reports: (await reports.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }) },

  resolveReport: {
    async run(b, me) {
      const r = await reports.get(b.id);
      if (!r) throw fail("Report not found", 404);
      r.status = b.status === "open" ? "open" : "resolved";
      r.resolution = text(b.resolution, 500);
      r.resolvedBy = me.username;
      r.resolvedAt = new Date().toISOString();
      await reports.save(r);
      return { report: r };
    },
  },

  // ---- Import from Japan ----

  listJcars: { run: async () => ({ cars: (await jcars.all()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")) }) },

  // Create (no id) or edit a Japan car. keepPhotos: photo URLs to keep (in order); newPhotos: data URLs to add.
  saveJcar: {
    async run(b, me) {
      const existing = b.id ? await jcars.get(b.id) : null;
      if (b.id && !existing) throw fail("Car not found", 404);
      const year = Number(b.year), price = Number(b.price), km = Number(b.km), cc = Number(b.cc);
      if (!text(b.make, 40) || !text(b.model, 60)) throw fail("Make and model are required.");
      if (!(year >= 1970 && year <= new Date().getFullYear() + 1)) throw fail("Check the year.");
      if (!(price > 0)) throw fail("Enter the price in Japan.");
      if (!(cc >= 50 && cc <= 10000)) throw fail("Enter the engine size in cc.");
      const id = existing ? existing.id : newId();
      const keep = existing ? (b.keepPhotos || []).filter((u) => existing.photos.includes(u)) : [];
      const added = [];
      for (const p of (b.newPhotos || []).slice(0, 12 - keep.length)) added.push(await savePhoto("jcar:" + id, p));
      if (existing) for (const u of existing.photos.filter((u) => !keep.includes(u))) await files.remove(photoFileId(u)).catch(() => {});
      const now = new Date().toISOString();
      const car = {
        id,
        refNo: text(b.refNo, 40),
        make: text(b.make, 40), model: text(b.model, 60), grade: text(b.grade, 80),
        year, km: km >= 0 ? km : 0, cc,
        fuel: ["Petrol", "Diesel", "Hybrid", "Electric"].includes(b.fuel) ? b.fuel : "Petrol",
        gearbox: ["Automatic", "Manual"].includes(b.gearbox) ? b.gearbox : "Automatic",
        drive: ["2WD", "4WD"].includes(b.drive) ? b.drive : "2WD",
        body: BODIES.includes(b.body) ? b.body : "Other",
        color: text(b.color, 30), chassis: text(b.chassis, 30), auctionGrade: text(b.auctionGrade, 10),
        price, currency: b.currency === "USD" ? "USD" : "JPY",
        saleType: SALE_TYPES.includes(b.saleType) ? b.saleType : "stock",
        auctionEnds: b.saleType === "auction" && b.auctionEnds ? new Date(b.auctionEnds).toISOString() : null,
        status: JSTATUSES.includes(b.status) ? b.status : "available",
        description: text(b.description, 3000),
        source: text(b.source, 120), internalNote: text(b.internalNote, 1000),
        photos: keep.concat(added),
        createdAt: existing ? existing.createdAt : now, createdBy: existing ? existing.createdBy : me.username,
        updatedAt: now, updatedBy: me.username,
      };
      await jcars.save(car);
      return { car };
    },
  },

  deleteJcar: {
    roles: VERIFIERS,
    async run(b) {
      await files.removeOwner("jcar:" + b.id);
      await jcars.remove(b.id);
      return { ok: true };
    },
  },

  getImportSettings: { run: async () => ({ settings: await getSettings() }) },
  saveImportSettings: { roles: VERIFIERS, run: async (b, me) => ({ settings: await saveSettings(b.settings || {}, me.username) }) },

  listRequests: { run: async () => ({ requests: (await jrequests.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }) },

  updateRequest: {
    async run(b, me) {
      const r = await jrequests.get(b.id);
      if (!r) throw fail("Request not found", 404);
      if (b.status) {
        if (!REQUEST_STATUSES.includes(b.status)) throw fail("Bad status");
        r.status = b.status;
      }
      if (b.note) r.notes = (r.notes || []).concat({ by: me.username, at: new Date().toISOString(), text: text(b.note, 1000) });
      r.updatedAt = new Date().toISOString();
      await jrequests.save(r);
      return { request: r };
    },
  },

  deleteMember: {
    roles: ADMIN,
    async run(b) {
      const m = await members.get(b.id);
      if (m) await removeMember(m);
      return { ok: true };
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  let b;
  try {
    b = await readBody(req);
  } catch {
    return send(res, 400, { error: "Invalid request" });
  }
  try {
    if (Object.hasOwn(open, b.action)) return send(res, 200, await open[b.action](b));
    const action = Object.hasOwn(actions, b.action) ? actions[b.action] : null;
    if (!action) return send(res, 400, { error: "Unknown action" });
    const t = readToken(req);
    const me = t && t.kind === "s" ? await users.get(t.id) : null;
    if (!me || !me.active) return send(res, 401, { error: "Please log in again" });
    if (action.roles && !action.roles.includes(me.role)) return send(res, 403, { error: "Your role can't do this." });
    send(res, 200, await action.run(b, me));
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 400, { error: e.message });
  }
}
