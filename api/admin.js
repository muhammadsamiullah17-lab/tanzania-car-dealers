// POST /api/admin { action, ... } for staff. Logging in happens in /api/account (one login for all).
// "status" and "setup" are open; everything else needs a logged-in, active staff user.
// Each action lists the roles allowed to run it (default: all staff roles).
import { ads, dealers, newId, digits, sortListings, readBody, send } from "../lib/store.js";
import { checkSetupKey, issueToken, readToken } from "../lib/auth.js";
import { users, ROLES, cleanUsername, checkNewPassword, hashPassword, verifyPassword, newUser, publicUser } from "../lib/users.js";
import { members, staffView, readDoc, removeMember } from "../lib/members.js";

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
