import { createClient } from '@supabase/supabase-js';

const REMEMBER_KEY = 'cashbox-remember-me';

function chooseBackingStorage() {
  if (typeof window === 'undefined') return undefined;
  // Unset (never chosen yet) behaves exactly like it always has —
  // persisted in localStorage — so existing sessions aren't affected by
  // this being added.
  return window.localStorage.getItem(REMEMBER_KEY) === 'false' ? window.sessionStorage : window.localStorage;
}

// Backs a "Remember me" checkbox on the login form: checked (default)
// keeps the session in localStorage, surviving a browser restart;
// unchecked keeps it in sessionStorage, so closing the tab logs them out.
// supabase-js calls through this on every read/write, so the preference is
// checked live rather than picked once when the client is created — call
// setRememberMe() before the login call that starts the new session.
const rememberAwareStorage = {
  getItem: (key) => chooseBackingStorage()?.getItem(key) ?? null,
  setItem: (key, value) => chooseBackingStorage()?.setItem(key, value),
  removeItem: (key) => chooseBackingStorage()?.removeItem(key),
};

export function setRememberMe(remember) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
  } catch {
    // ignore — worst case it falls back to the default (remembered)
  }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { storage: rememberAwareStorage } }
);

const TABLES = {
  ChitPlan: 'chit_plans',
  ChitGroup: 'chit_groups',
  GroupMembership: 'group_memberships',
  PlanRequest: 'plan_requests',
  MemberProfile: 'member_profiles',
  Dividend: 'dividends',
  AuditLog: 'audit_logs',
  Payment: 'payments',
  Document: 'documents',
  Winner: 'winners',
  Auction: 'auctions',
  AuctionBid: 'auction_bids',
  AuctionMessage: 'auction_messages',
  WhatsAppInboundMessage: 'whatsapp_inbound_messages',
};

// Base44 tolerated "" for unset optional fields of any type (dates, numbers, uuids);
// Postgres rejects "" for those types, so normalize blank strings to null before writing.
function sanitizePayload(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    out[key] = value === '' ? null : value;
  }
  return out;
}

function applyOrder(query, orderBy) {
  if (!orderBy) return query;
  const desc = orderBy.startsWith('-');
  let column = desc ? orderBy.slice(1) : orderBy;
  if (column === 'created_date') column = 'created_at';
  else if (column === 'updated_date') column = 'updated_at';
  return query.order(column, { ascending: !desc });
}

function makeEntity(table) {
  return {
    async list(orderBy, limit) {
      let query = supabase.from(table).select('*');
      query = applyOrder(query, orderBy);
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async filter(match = {}, orderBy, limit) {
      let query = supabase.from(table).select('*').match(match);
      query = applyOrder(query, orderBy);
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
    async create(payload) {
      const { data, error } = await supabase.from(table).insert(sanitizePayload(payload)).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(sanitizePayload(payload)).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
    async deleteMany(match) {
      const { error } = await supabase.from(table).delete().match(match);
      if (error) throw error;
      return true;
    },
    async bulkCreate(items) {
      const { data, error } = await supabase.from(table).insert(items.map(sanitizePayload)).select();
      if (error) throw error;
      return data;
    },
  };
}

const entities = Object.fromEntries(
  Object.entries(TABLES).map(([key, table]) => [key, makeEntity(table)])
);

async function me() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw error || new Error('Not authenticated');
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return {
    id: user.id,
    email: user.email,
    role: profile?.role ?? 'user',
    app_role: profile?.app_role ?? 'member',
    branch: profile?.branch ?? null,
    phone: profile?.phone ?? null,
  };
}

export const base44 = {
  auth: {
    me,
    async isAuthenticated() {
      const { data } = await supabase.auth.getSession();
      return !!data.session;
    },
    async logout(redirectTo) {
      await supabase.auth.signOut();
      if (redirectTo) window.location.href = redirectTo;
    },
    async loginViaEmailPassword(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    // Phone/WhatsApp signup: creates the account with a password up front,
    // but leaves it unconfirmed. Supabase sends a one-time confirmation
    // code via its Send SMS Hook (which we've pointed at WhatsApp delivery
    // instead of a paid SMS provider) — call verifyPhoneSignup() with that
    // code to actually confirm the account and get a session. No session
    // exists yet after this call returns.
    async signUpWithPhone(phone, password) {
      const { error } = await supabase.auth.signUp({ phone, password });
      if (error) throw error;
    },
    // One-time, at signup only — confirms the phone number and returns a
    // session. Every login after this uses loginViaPhonePassword() instead,
    // no OTP involved.
    async verifyPhoneSignup(phone, token) {
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
      if (error) throw error;
    },
    async loginViaPhonePassword(phone, password) {
      const { error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error) throw error;
    },
    // Lets the combined phone-entry screen decide whether to show a
    // password field or a create-account form, before the person has to
    // pick one themselves. auth.users.phone is stored without the leading
    // "+" (E.164 in, bare digits out — Supabase's own normalization), so
    // this strips it to match what's actually in the column.
    async phoneExists(phone) {
      const { data, error } = await supabase.rpc('phone_number_exists', {
        check_phone: phone.replace(/^\+/, ''),
      });
      if (error) throw error;
      return !!data;
    },
    // Distinguishes "no account" from "account exists but was never
    // confirmed" (signup started, OTP never entered) — the combined
    // phone-entry screen needs the difference: an unconfirmed account has
    // to resume OTP verification, since it has no working password yet and
    // never will until it's confirmed. Returns 'none' | 'unconfirmed' | 'confirmed'.
    async phoneAccountStatus(phone) {
      const { data, error } = await supabase.rpc('phone_account_status', {
        check_phone: phone.replace(/^\+/, ''),
      });
      if (error) throw error;
      return data;
    },
    // Resends the signup confirmation code for an existing-but-unconfirmed
    // account, without touching the password already set on it — the
    // purpose-built counterpart to signUpWithPhone for resuming a signup
    // that was abandoned before the OTP step.
    async resendPhoneConfirmation(phone) {
      const { error } = await supabase.auth.resend({ type: "sms", phone });
      if (error) throw error;
    },
    // Phone accounts have no email to send a reset link to, so "forgot
    // password" reuses the same OTP machinery as signup: an OTP proves you
    // control the number, and a verified OTP is itself a real login — no
    // separate "reset token" concept needed. shouldCreateUser: false is the
    // whole point here — this must fail for a number with no account,
    // rather than silently creating one.
    async sendPasswordResetOtp(phone) {
      const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
      if (error) throw error;
    },
    // Verifying the code logs them in for real (same as verifyPhoneSignup)
    // — from here they're authenticated and can call updatePassword below.
    async verifyPasswordResetOtp(phone, token) {
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
      if (error) throw error;
    },
    async updatePassword(newPassword) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    async loginWithProvider(provider, returnTo) {
      const redirectTo = new URL(returnTo || '/', window.location.origin).toString();
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
      if (error) throw error;
    },
    async resetPasswordRequest(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    },
  },
  entities,
  integrations: {
    Core: {
      async SendEmail(payload) {
        const { data, error } = await supabase.functions.invoke('sendEmail', { body: payload });
        if (error) throw error;
        return { data };
      },
    },
  },
  functions: {
    async invoke(name, body) {
      const { data, error } = await supabase.functions.invoke(name, { body });
      if (error) throw error;
      return { data };
    },
  },
};
