// POST /api/admin { action, ... }.
// "status", "setup" and "login" are open; everything else needs a logged-in, active user.
// Actions marked adminOnly need the "admin" role; "staff" can manage ads and dealers.
import { ads, dealers, newId, digits, sortListings, readBody, send } from "../lib/store.js";
import { checkSetupKey, issueToken, tokenUserId } from "../lib/auth.js";
import { users, ROLES, cleanUsername, checkNewPassword, hashPassword, verifyPassword, newUser, publicUser } from "../lib/users.js";

const STATUSES = ["pending", "approved", "rejected", "sold"];

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
    return { token: issueToken(user.id), user: publicUser(user) };
  },

  async login(b) {
    const user = await users.byUsername(String(b.username || "").trim().toLowerCase());
    if (!user || !verifyPassword(b.password, user.passwordHash)) throw fail("Wrong ID or password.", 401);
    if (!user.active) throw fail("This account is disabled. Ask your admin.", 403);
    user.lastLoginAt = new Date().toISOString();
    await users.save(user);
    return { token: issueToken(user.id), user: publicUser(user) };
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
    adminOnly: true,
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
    adminOnly: true,
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
    adminOnly: true,
    run: async () => ({ users: (await users.all()).map(publicUser).sort((a, b) => a.username.localeCompare(b.username)) }),
  },

  // Create (no id) or edit (with id) a user. On edit, password is optional and resets it.
  saveUser: {
    adminOnly: true,
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
    adminOnly: true,
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
    const uid = tokenUserId(req);
    const me = uid ? await users.get(uid) : null;
    if (!me || !me.active) return send(res, 401, { error: "Please log in again" });
    if (action.adminOnly && me.role !== "admin") return send(res, 403, { error: "Only admins can do this." });
    send(res, 200, await action.run(b, me));
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 400, { error: e.message });
  }
}
