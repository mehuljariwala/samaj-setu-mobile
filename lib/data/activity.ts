import 'server-only';

import { after } from 'next/server';
import { headers } from 'next/headers';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { originOf } from './activity-origin';

/**
 * The activity log an admin reads on /admin/users/[id]: what each account did,
 * from signing in to sending an interest. Screens opened are recorded in
 * proxy.ts; actions are recorded here, by the Server Action that took them.
 *
 * Recording never gets in the way. It runs after the response has gone
 * (`after`), and a failure is logged and dropped — a member's interest must
 * not fail because the log could not be written.
 */

export type ActivityInput = {
  /** The candidate acted for. */
  candidateId?: string | null;
  /** The candidate acted on: an interest's recipient, a saved profile. */
  targetCandidateId?: string | null;
  /** Codes and flags only. Never names, numbers, passwords or document paths. */
  detail?: Record<string, Json | undefined>;
};

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Records now and waits. For the one case that cannot wait: signing out. */
export async function recordActivity(kind: string, input: ActivityInput = {}, client?: Client) {
  try {
    const supabase = client ?? await createSupabaseServerClient();
    const { ip, userAgent } = originOf(await headers());
    const { error } = await supabase.rpc('record_activity', {
      p_kind: kind,
      p_candidate_id: input.candidateId ?? undefined,
      p_target_candidate_id: input.targetCandidateId ?? undefined,
      p_detail: (input.detail ?? {}) as Json,
      p_ip: ip ?? undefined,
      p_user_agent: userAgent ?? undefined,
    });
    if (error) console.error('activity not recorded', kind, error.message);
  } catch (error) {
    console.error('activity not recorded', kind, error);
  }
}

/**
 * Records once the response has been sent. Pass `client` when the session was
 * created in this same request (sign-in, sign-up), since the cookies holding
 * it have not reached the browser yet.
 */
export function track(kind: string, input: ActivityInput = {}, client?: Client) {
  after(() => recordActivity(kind, input, client));
}

/**
 * A wrong password has no session to record it with, so this one goes through
 * the service role. The database ignores numbers with no account behind them.
 */
export function trackFailedSignIn(phone: string, reason: 'wrong_password' | 'switched_off') {
  after(async () => {
    try {
      const { ip, userAgent } = originOf(await headers());
      const { error } = await createSupabaseAdminClient().rpc('record_failed_sign_in', {
        p_phone: phone,
        p_reason: reason,
        p_ip: ip ?? undefined,
        p_user_agent: userAgent ?? undefined,
      });
      if (error) console.error('failed sign-in not recorded', error.message);
    } catch (error) {
      console.error('failed sign-in not recorded', error);
    }
  });
}
