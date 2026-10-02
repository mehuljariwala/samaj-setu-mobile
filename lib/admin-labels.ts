import type { T } from '@/lib/i18n';
import type { Enums } from '@/lib/supabase/database.types';

/**
 * Words for enum values, on the admin and member screens alike. The database
 * speaks in `correction_requested` and `reopen`; someone reading on a phone
 * should see what they mean, in their language.
 */

export function applicationStatusLabel(t: T, status: Enums<'application_status'> | null) {
  switch (status) {
    case 'draft': return t('અધૂરી', 'Draft');
    case 'submitted': return t('નવી', 'New');
    case 'under_review': return t('સમીક્ષામાં', 'In review');
    case 'correction_requested': return t('સુધારાની રાહ', 'Awaiting correction');
    case 'approved': return t('મંજૂર', 'Approved');
    case 'rejected': return t('નામંજૂર', 'Rejected');
    case 'withdrawn': return t('પાછી ખેંચી', 'Withdrawn');
    default: return status ?? '—';
  }
}

/** The colour that goes with each status, so a tag reads before its words do. */
export function applicationStatusTone(status: Enums<'application_status'> | null) {
  switch (status) {
    case 'approved': return 'ok';
    case 'rejected': return 'bad';
    case 'correction_requested': return 'warn';
    case 'submitted':
    case 'under_review': return 'gold';
    default: return 'muted';
  }
}

export function identityStatusLabel(t: T, status: string) {
  switch (status) {
    case 'unverified': return t('અચકાસાયેલ', 'Not verified');
    case 'pending': return t('ચકાસણી બાકી', 'Pending');
    case 'correction_requested': return t('સુધારો માંગ્યો', 'Correction asked');
    case 'verified': return t('ચકાસાયેલ', 'Verified');
    case 'rejected': return t('નામંજૂર', 'Rejected');
    case 'suspended': return t('સ્થગિત', 'Suspended');
    default: return status;
  }
}

export function relationshipLabel(t: T, relationship: string | null) {
  switch (relationship) {
    case 'self': return t('પોતે', 'Self');
    case 'son': return t('દીકરો', 'Son');
    case 'daughter': return t('દીકરી', 'Daughter');
    case 'brother': return t('ભાઈ', 'Brother');
    case 'sister': return t('બહેન', 'Sister');
    case 'ward': return t('આશ્રિત', 'Ward');
    default: return t('અન્ય', 'Other');
  }
}

export function interestStatusLabel(t: T, status: Enums<'interest_status'>, outgoing: boolean) {
  switch (status) {
    case 'pending': return outgoing ? t('જવાબની રાહ', 'Awaiting reply') : t('નવો', 'New');
    case 'accepted': return t('સ્વીકાર્યો', 'Accepted');
    case 'declined': return t('ના પાડી', 'Declined');
    case 'withdrawn': return t('પાછો ખેંચ્યો', 'Withdrawn');
    case 'expired': return t('સમય પૂરો', 'Expired');
    default: return status;
  }
}

export function accessRequestStatusLabel(t: T, status: Enums<'access_request_status'>) {
  switch (status) {
    case 'pending': return t('ચકાસણી બાકી', 'Being checked');
    case 'approved': return t('મંજૂર', 'Approved');
    case 'rejected': return t('નામંજૂર', 'Not approved');
    case 'withdrawn': return t('પાછી ખેંચી', 'Withdrawn');
    default: return status;
  }
}

/**
 * `reopen` is recorded both when the family sends the application and when
 * they reopen it themselves (after a rejection, or to change verified
 * details); where it went tells the two apart.
 */
export function reviewActionLabel(t: T, action: string, toStatus?: string | null) {
  switch (action) {
    case 'approve': return t('મંજૂર કર્યું', 'Approved');
    case 'request_correction': return t('સુધારો માંગ્યો', 'Correction requested');
    case 'reject': return t('નામંજૂર કર્યું', 'Rejected');
    case 'reopen': return toStatus === 'correction_requested'
      ? t('પરિવારે સુધારવા ફરી ખોલી', 'Reopened by the family to fix')
      : t('અરજી મળી', 'Submitted');
    case 'claim': return t('સમીક્ષા શરૂ', 'Review started');
    case 'release': return t('સમીક્ષા છોડી', 'Review released');
    default: return action;
  }
}

/** The fields a correction may name, in the words the applicant's form uses. */
export function correctionFieldLabel(t: T, field: string) {
  switch (field) {
    case 'full_name': return t('પૂરું નામ', 'Full name');
    case 'date_of_birth': return t('જન્મ તારીખ', 'Date of birth');
    case 'father_name': return t('પિતાનું નામ', 'Father’s name');
    case 'city': return t('શહેર', 'City');
    case 'birth_certificate': return t('જન્મ / લિવિંગ સર્ટિફિકેટ', 'Birth / leaving certificate');
    case 'identity_document': return t('આધાર / મતદાર કાર્ડ', 'Aadhaar / Voter ID');
    default: return field;
  }
}

/** Which proof of birth date was uploaded; certificates from before the choice existed are birth certificates. */
export function certificateLabel(t: T, type: string | null | undefined) {
  return type === 'leaving'
    ? t('સ્કૂલ / કૉલેજ લિવિંગ સર્ટિફિકેટ', 'School or college leaving certificate')
    : t('જન્મ પ્રમાણપત્ર', 'Birth certificate');
}

export type Sla = {
  state: 'overdue' | 'soon' | 'ok' | 'none';
  /** Whole hours left, or over when overdue. */
  hours: number;
  /** Share of the review window used, 0–1. */
  used: number;
};

// The dashboard's own "approaching" window (admin_dashboard), so the tile and
// the rows agree.
const SOON_HOURS = 4;

/**
 * Where an application stands against its review target. The database's
 * `overdue` flag stays the authority for the word "overdue"; this adds how far
 * in, so the queue can show a bar rather than a bare timestamp.
 */
export function reviewSla(submittedAt: string | null, dueAt: string | null, overdue: boolean | null): Sla {
  if (!submittedAt || !dueAt) return { state: 'none', hours: 0, used: 0 };
  const start = new Date(submittedAt).getTime();
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const left = due - now;
  const used = Math.min(1, Math.max(0, (now - start) / Math.max(1, due - start)));
  const hours = Math.max(1, Math.round(Math.abs(left) / 3_600_000));

  if (overdue || left <= 0) return { state: 'overdue', hours, used: 1 };
  if (left < SOON_HOURS * 3_600_000) return { state: 'soon', hours, used };
  return { state: 'ok', hours, used };
}

export function slaLabel(t: T, sla: Sla) {
  switch (sla.state) {
    case 'overdue': return t(`${sla.hours} કલાક મોડું`, `${sla.hours} hr overdue`);
    case 'soon':
    case 'ok': return t(`${sla.hours} કલાક બાકી`, `${sla.hours} hr left`);
    default: return '';
  }
}
