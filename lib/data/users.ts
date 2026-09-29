import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Enums, Json } from '@/lib/supabase/database.types';
import { unwrap } from './errors';
import { requireStaff } from './session';

/**
 * User management: the accounts list, one account's record and activity, and
 * the two things an admin can do to an account — switch it on or off, and set
 * a new password for someone who forgot theirs.
 *
 * As in admin.ts, requireStaff() here is for a usable error; the RPCs decide.
 * Moderators may read; only admins may change; only the superadmin may change
 * a staff account; nobody may change their own.
 */

export type AccountFilter = 'all' | 'active' | 'disabled' | 'blocked' | 'staff';
export const ACCOUNT_FILTERS: readonly AccountFilter[] = ['all', 'active', 'disabled', 'blocked', 'staff'];

export type ManagedStatus = 'active' | 'disabled' | 'blocked';

export type AccountCandidate = {
  id: string;
  full_name: string;
  public_code: string;
  relationship: Enums<'relationship'>;
  identity_status: Enums<'identity_status'>;
  discoverable: boolean;
};

export type AccountRow = {
  id: string;
  phone: string;
  display_name: string | null;
  status: Enums<'account_status'>;
  created_at: string;
  last_sign_in_at: string | null;
  last_active_at: string | null;
  roles: Enums<'app_role'>[];
  candidates: AccountCandidate[];
  seen: string;
};

export type AccountList = {
  counts: Record<AccountFilter, number>;
  total: number;
  rows: AccountRow[];
};

export type AccountDetail = {
  id: string;
  phone: string;
  display_name: string | null;
  status: Enums<'account_status'>;
  status_reason: string | null;
  preferred_language: Enums<'language_code'>;
  created_at: string;
  last_sign_in_at: string | null;
  rules_version: string | null;
  rules_accepted_at: string | null;
  roles: Enums<'app_role'>[];
  candidates: AccountCandidate[];
  sign_ins: number;
  failed_sign_ins_week: number;
  last_password_reset_at: string | null;
  can_manage: boolean;
};

type Person = { id: string; phone: string; name: string | null } | null;
type CandidateRef = { id: string; name: string; code: string } | null;

export type ActivityEntry = {
  id: string;
  occurred_at: string;
  kind: string;
  detail: Record<string, Json> | null;
  path: string | null;
  ip: string | null;
  user_agent: string | null;
  by_self: boolean;
  actor: Person;
  candidate: CandidateRef;
  target: CandidateRef;
  subject: Person;
};

export async function listAccounts(options: {
  query?: string;
  filter?: AccountFilter;
  limit?: number;
  offset?: number;
} = {}) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_list_accounts', {
      p_query: options.query?.trim() || undefined,
      p_filter: options.filter ?? 'all',
      p_limit: options.limit ?? 30,
      p_offset: options.offset ?? 0,
    }),
  ) as unknown as AccountList;
}

export async function getAccount(accountId: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_account_detail', { p_account_id: accountId }),
  ) as unknown as AccountDetail;
}

export async function getAccountActivity(accountId: string, before?: string, limit = 60) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_account_activity', {
      p_account_id: accountId,
      p_before: before || undefined,
      p_limit: limit,
    }),
  ) as unknown as ActivityEntry[];
}

export async function setAccountStatus(accountId: string, status: ManagedStatus, reason?: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return unwrap(
    await supabase.rpc('admin_set_account_status', {
      p_account_id: accountId,
      p_status: status,
      p_reason: reason?.trim() || undefined,
    }),
  ) as unknown as { status: ManagedStatus; changed: boolean };
}

/** The password goes to the database once, is hashed there, and is not kept. */
export async function resetPassword(accountId: string, password: string) {
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  unwrap(await supabase.rpc('admin_reset_password', { p_account_id: accountId, p_password: password }));
}
