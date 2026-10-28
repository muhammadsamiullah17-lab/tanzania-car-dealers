// POST /api/account { action, ... } for customer members, plus the one login used by everyone.
// "signup" and "login" are open; the rest need a member session.
import { ads, sortListings, readBody, send } from "../lib/store.js";
import { issueToken, readToken } from "../lib/auth.js";
import { users, publicUser } from "../lib/users.js";
import { checkNewPassword, hashPassword, verifyPassword } from "../lib/secure.js";
import { members, cleanPhone, profileFields, newMember, missing, selfView, saveDoc, DOC_KINDS } from "../lib/members.js";

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// Members can edit their details and documents until they are verified.
function editable(me) {
  if (["verified", "suspended"].includes(me.status)) throw fail("Your account is " + me.status + ". Contact us on WhatsApp to change your details.");
}

const open = {
  async signup(b) {
    const type = b.type === "dealer" ? "dealer" : "private";
    const phone = cleanPhone(b.phone);
    checkNewPassword(b.password);
    if (!b.consent) throw fail("Please agree to the verification terms.");
    if (await members.byPhone(phone)) throw fail("An account with this phone number already exists. Please log in.", 409);
    const m = newMember(type, phone, b.password, profileFields(type, b));
    await members.save(m);
    return { token: issueToken("m", m.id), kind: "m", user: selfView(m) };
  },

  // One login for everyone: a phone number logs in a customer, anything else is a staff ID.
  // A number that matches no customer is still tried as a staff ID.
  async login(b) {
    const id = String(b.identifier || "").trim();
    let m = null;
    if (/^[+\d\s-]+$/.test(id)) {
      try { m = await members.byPhone(cleanPhone(id)); } catch { m = null; }
    }
    if (m) {
      if (!verifyPassword(b.password, m.passwordHash)) throw fail("Wrong phone number or password.", 401);
      if (m.status === "suspended") throw fail("This account is suspended. Contact us on WhatsApp.", 403);
      m.lastLoginAt = new Date().toISOString();
      await members.save(m);
      return { token: issueToken("m", m.id), kind: "m", user: selfView(m) };
    }
    const u = await users.byUsername(id.toLowerCase());
    if (!u || !verifyPassword(b.password, u.passwordHash)) throw fail("Wrong phone number / ID or password.", 401);
    if (!u.active) throw fail("This account is disabled. Ask your admin.", 403);
    u.lastLoginAt = new Date().toISOString();
    await users.save(u);
    return { token: issueToken("s", u.id), kind: "s", user: publicUser(u) };
  },
};

const actions = {
  async me(b, me) {
    return { user: selfView(me), docKinds: DOC_KINDS[me.type] };
  },

  async updateProfile(b, me) {
    editable(me);
    Object.assign(me, profileFields(me.type, b));
    if (me.status === "rejected") me.status = "incomplete";
    me.updatedAt = new Date().toISOString();
    await members.save(me);
    return { user: selfView(me) };
  },

  async uploadDoc(b, me) {
    editable(me);
    await saveDoc(me, b.kind, b.data, b.name);
    if (me.status === "review") me.docsChecked = false;
    me.updatedAt = new Date().toISOString();
    await members.save(me);
    return { user: selfView(me) };
  },

  async submitForReview(b, me) {
    editable(me);
    const gaps = missing(me);
    if (gaps.length) throw fail("Still missing: " + gaps.join(", ") + ".");
    me.status = "review";
    me.submittedAt = new Date().toISOString();
    me.updatedAt = me.submittedAt;
    await members.save(me);
    return { user: selfView(me) };
  },

  async changePassword(b, me) {
    if (!verifyPassword(b.currentPassword, me.passwordHash)) throw fail("Your current password is wrong.");
    me.passwordHash = hashPassword(checkNewPassword(b.newPassword));
    me.updatedAt = new Date().toISOString();
    await members.save(me);
    return { ok: true };
  },

  async myAds(b, me) {
    return { ads: sortListings((await ads.all()).filter((a) => a.memberId === me.id)) };
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
    const fn = Object.hasOwn(actions, b.action) ? actions[b.action] : null;
    if (!fn) return send(res, 400, { error: "Unknown action" });
    const t = readToken(req);
    const me = t && t.kind === "m" ? await members.get(t.id) : null;
    if (!me || me.status === "suspended") return send(res, 401, { error: "Please log in again" });
    send(res, 200, await fn(b, me));
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 400, { error: e.message });
  }
}
