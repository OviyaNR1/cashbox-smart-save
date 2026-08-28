import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
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
