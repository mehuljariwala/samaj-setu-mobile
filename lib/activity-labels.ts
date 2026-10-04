import type { T } from '@/lib/i18n';
import { correctionFieldLabel } from '@/lib/admin-labels';

/**
 * Words for the activity log on /admin/users/[id]. The database records
 * `interest.sent` and `/discover/4f…`; an admin reading it on a phone should
 * see "Sent an interest" and "Opened a profile".
 */

export type ActivityTone = 'auth' | 'bad' | 'view' | 'act' | 'staff' | 'review';

type Labelled = { title: string; tone: ActivityTone };

export function screenLabel(t: T, path: string): string {
  const [, first = '', second, third] = path.split('/');
  switch (first) {
    case '': return t('સ્વાગત સ્ક્રીન', 'Welcome screen');
    case 'sign-in': return t('લૉગ ઇન સ્ક્રીન', 'Sign-in screen');
    case 'sign-up': return t('નવું એકાઉન્ટ સ્ક્રીન', 'Sign-up screen');
    case 'register': return t('નોંધણી ફોર્મ', 'Registration form');
    case 'review': return t('અરજીની સ્થિતિ', 'Application status');
    case 'home': return t('હોમ', 'Home');
    case 'discover': return second ? t('એક પ્રોફાઇલ', 'A profile') : t('શોધો', 'Discover');
    case 'interests': return t('રસ', 'Interests');
    case 'family': return second === 'link' ? t('પરિવાર જોડો', 'Link a family member') : t('પરિવાર', 'Family');
    case 'biodata': return t('બાયોડેટા', 'Biodata');
    case 'notifications': return t('સૂચનાઓ', 'Notifications');
    case 'support': return t('મદદ', 'Help');
    case 's': return t('શેર કરેલી પ્રોફાઇલ', 'A shared profile');
    case 'account-off': return t('એકાઉન્ટ બંધ સ્ક્રીન', 'Account switched off screen');
    case 'admin':
      if (second === 'registrations' && third) return t('એડમિન: એક અરજી', 'Admin: an application');
      if (second === 'users' && third) return t('એડમિન: એક યુઝર', 'Admin: a user');
      if (second === 'users') return t('એડમિન: યુઝર્સ', 'Admin: users');
      if (second === 'publication') return t('એડમિન: બાયોડેટા', 'Admin: biodata');
      return t('એડમિન ડેશબોર્ડ', 'Admin dashboard');
    default: return path;
  }
}

function subjectLabel(t: T, subject: string) {
  switch (subject) {
    case 'registration': return t('નોંધણી', 'registration');
    case 'biodata_revision': return t('બાયોડેટા', 'biodata');
    case 'access_request': return t('પરિવાર જોડાણ વિનંતી', 'family link request');
    case 'duplicate': return t('ડુપ્લિકેટ', 'duplicate');
    case 'media': return t('ફોટો', 'photo');
    default: return subject;
  }
}

function decisionLabel(t: T, action: string) {
  switch (action) {
    case 'approve': return t('મંજૂર', 'approved');
    case 'request_correction': return t('સુધારો માંગ્યો', 'correction requested');
    case 'reject': return t('નામંજૂર', 'rejected');
    case 'reopen': return t('ફરી ખોલી', 'reopened');
    case 'claim': return t('સમીક્ષા શરૂ', 'review started');
    case 'release': return t('સમીક્ષા છોડી', 'review released');
    default: return action;
  }
}

export function accountStatusWord(t: T, status: string) {
  switch (status) {
    case 'active': return t('ચાલુ', 'Active');
    case 'disabled': return t('બંધ', 'Disabled');
    case 'blocked': return t('બ્લૉક', 'Blocked');
    case 'suspended': return t('સ્થગિત', 'Suspended');
    case 'closed': return t('બંધ કરેલું', 'Closed');
    default: return status;
  }
}

const ACTIONS: Record<string, [gu: string, en: string]> = {
  'registration.started': ['નોંધણી શરૂ કરી', 'Started a registration'],
  'registration.updated': ['નોંધણીની વિગતો બદલી', 'Edited registration details'],
  'registration.certificate_uploaded': ['જન્મ / લિવિંગ સર્ટિફિકેટ અપલોડ કર્યું', 'Uploaded the birth or leaving certificate'],
  'registration.identity_uploaded': ['ઓળખપત્ર અપલોડ કર્યું', 'Uploaded a photo ID'],
  'registration.submitted': ['અરજી મોકલી', 'Submitted the application'],
  'registration.withdrawn': ['અરજી પાછી ખેંચી', 'Withdrew the application'],
  'registration.change_requested': ['ઓળખની વિગત બદલવા વિનંતી કરી', 'Asked to change identity details'],
  'family.access_requested': ['હાલની પ્રોફાઇલ સાથે જોડાવા વિનંતી કરી', 'Asked to link to an existing profile'],
  'family.switches_changed': ['પ્રોફાઇલ થોભાવી / ચાલુ કરી', 'Changed pause / match-found switches'],
  'family.preferences_changed': ['પરિવારની પસંદગીઓ બદલી', 'Changed family preferences'],
  'family.switched_candidate': ['બીજા ઉમેદવાર પર ગયા', 'Switched to another candidate'],
  'profile.updated': ['પોતાની વિગતો બદલી', 'Updated their own details'],
  'biodata.draft_saved': ['બાયોડેટા પર કામ કર્યું', 'Worked on the biodata'],
  'biodata.imported': ['બાયોડેટા આયાત કર્યો', 'Imported a biodata'],
  'biodata.fields_confirmed': ['બાયોડેટાની વિગતો ખાતરી કરી', 'Confirmed biodata fields'],
  'biodata.community_confirmed': ['સમાજની વિગતો ખાતરી કરી', 'Confirmed community details'],
  'biodata.submitted': ['બાયોડેટા મોકલ્યો', 'Submitted the biodata'],
  'consent.granted': ['પ્રોફાઇલ બતાવવા સંમતિ આપી', 'Gave consent to publish'],
  'consent.withdrawn': ['સંમતિ પાછી ખેંચી', 'Withdrew consent to publish'],
  'privacy.changed': ['ગોપનીયતા સેટિંગ બદલ્યું', 'Changed privacy settings'],
  'discover.saved': ['પ્રોફાઇલ સાચવી', 'Saved a profile'],
  'discover.unsaved': ['સાચવેલી પ્રોફાઇલ કાઢી', 'Removed a saved profile'],
  'interest.sent': ['રસ મોકલ્યો', 'Sent an interest'],
  'interest.accepted': ['રસ સ્વીકાર્યો', 'Accepted an interest'],
  'interest.declined': ['રસની ના પાડી', 'Declined an interest'],
  'interest.withdrawn': ['રસ પાછો ખેંચ્યો', 'Withdrew an interest'],
  'candidate.blocked': ['પ્રોફાઇલ બ્લૉક કરી', 'Blocked a profile'],
  'candidate.unblocked': ['પ્રોફાઇલ અનબ્લૉક કરી', 'Unblocked a profile'],
  'media.uploaded': ['ફોટો અપલોડ કર્યો', 'Uploaded a photo'],
  'media.primary_set': ['મુખ્ય ફોટો બદલ્યો', 'Changed the main photo'],
  'media.removed': ['ફોટો કાઢ્યો', 'Removed a photo'],
  'media.access_requested': ['ફોટો જોવા વિનંતી કરી', 'Asked to see photos'],
  'media.access_approved': ['ફોટો જોવાની મંજૂરી આપી', 'Allowed someone to see photos'],
  'media.access_declined': ['ફોટો જોવાની ના પાડી', 'Declined a photo request'],
  'media.grant_revoked': ['ફોટો મંજૂરી પાછી ખેંચી', 'Took back photo access'],
  'share.created': ['શેર લિંક બનાવી', 'Created a share link'],
  'share.revoked': ['શેર લિંક બંધ કરી', 'Turned off a share link'],
  'settings.language': ['ભાષા બદલી', 'Changed language'],
  'admin.certificate_viewed': ['જન્મ / લિવિંગ સર્ટિફિકેટ ખોલ્યું', 'Opened a birth or leaving certificate'],
  'admin.document_viewed': ['ઓળખપત્ર ખોલ્યું', 'Opened a photo ID'],
  'admin.rule_changed': ['સમાજનો નિયમ બદલ્યો', 'Changed a community rule'],
  'admin.settings_changed': ['સેટિંગ્સ બદલ્યાં', 'Changed settings'],
  'admin.role_granted': ['સ્ટાફ ભૂમિકા આપી', 'Gave a staff role'],
  'admin.role_revoked': ['સ્ટાફ ભૂમિકા લીધી', 'Removed a staff role'],
};

export function activityLabel(
  t: T,
  entry: { kind: string; path: string | null; detail: Record<string, unknown> | null },
): Labelled {
  const { kind, detail } = entry;
  const to = typeof detail?.to === 'string' ? detail.to : '';

  switch (kind) {
    case 'auth.sign_up': return { title: t('એકાઉન્ટ બનાવ્યું, નિયમો સ્વીકાર્યા', 'Created the account and accepted the rules'), tone: 'auth' };
    case 'auth.sign_in': return { title: t('લૉગ ઇન કર્યું', 'Signed in'), tone: 'auth' };
    case 'auth.sign_out': return { title: t('લૉગ આઉટ કર્યું', 'Signed out'), tone: 'auth' };
    case 'account.password_changed': return { title: t('પોતાનો પાસવર્ડ બદલ્યો', 'Changed their own password'), tone: 'auth' };
    case 'auth.sign_in_failed':
      return {
        title: detail?.reason === 'switched_off'
          ? t('લૉગ ઇનનો પ્રયાસ — એકાઉન્ટ બંધ છે', 'Tried to sign in while switched off')
          : t('ખોટો પાસવર્ડ', 'Wrong password'),
        tone: 'bad',
      };
    case 'page.view': return { title: t(`જોયું: ${screenLabel(t, entry.path ?? '/')}`, `Opened ${screenLabel(t, entry.path ?? '/')}`), tone: 'view' };
    case 'account.status_changed':
      return { title: t(`એકાઉન્ટ: ${accountStatusWord(t, to)}`, `Account set to ${accountStatusWord(t, to).toLowerCase()}`), tone: to === 'active' ? 'staff' : 'bad' };
    case 'account.password_reset': return { title: t('એડમિને નવો પાસવર્ડ સેટ કર્યો', 'An admin set a new password'), tone: 'staff' };
    case 'staff.account.status_changed':
      return { title: t(`યુઝરનું એકાઉન્ટ: ${accountStatusWord(t, to)}`, `Set a user to ${accountStatusWord(t, to).toLowerCase()}`), tone: 'staff' };
    case 'staff.account.password_reset': return { title: t('યુઝરનો પાસવર્ડ બદલ્યો', 'Reset a user’s password'), tone: 'staff' };
  }

  const [scope, subject = '', action = ''] = kind.split('.');
  if (scope === 'review') {
    return {
      title: t(`${subjectLabel(t, subject)}: ${decisionLabel(t, action)}`, `Their ${subjectLabel(t, subject)} was ${decisionLabel(t, action)}`),
      tone: action === 'approve' ? 'review' : action === 'reject' ? 'bad' : 'staff',
    };
  }
  if (scope === 'staff') {
    return { title: t(`${subjectLabel(t, subject)}: ${decisionLabel(t, action)}`, `Reviewed a ${subjectLabel(t, subject)}: ${decisionLabel(t, action)}`), tone: 'staff' };
  }

  const known = ACTIONS[kind];
  return { title: known ? t(known[0], known[1]) : kind, tone: scope === 'admin' ? 'staff' : 'act' };
}

/** One extra line under the title, from the codes kept in `detail`. */
export function activityNote(t: T, detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  if (typeof detail.reason === 'string' && detail.reason && detail.reason !== 'wrong_password' && detail.reason !== 'switched_off') {
    return detail.reason;
  }
  if (Array.isArray(detail.fields) && detail.fields.length > 0) {
    return detail.fields.map((field) => correctionFieldLabel(t, String(field))).join(', ');
  }
  if (typeof detail.language === 'string') return detail.language === 'gu' ? 'ગુજરાતી' : 'English';
  return null;
}

/** "Android · Chrome" from a user-agent string; good enough to tell devices apart. */
export function deviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const os = /iPhone/.test(userAgent) ? 'iPhone'
    : /iPad/.test(userAgent) ? 'iPad'
      : /Android/.test(userAgent) ? 'Android'
        : /Windows/.test(userAgent) ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent) ? 'Mac'
            : /Linux/.test(userAgent) ? 'Linux' : null;
  const browser = /SamsungBrowser/.test(userAgent) ? 'Samsung Internet'
    : /Edg\//.test(userAgent) ? 'Edge'
      : /OPR\//.test(userAgent) ? 'Opera'
        : /Firefox|FxiOS/.test(userAgent) ? 'Firefox'
          : /Chrome|CriOS/.test(userAgent) ? 'Chrome'
            : /Safari/.test(userAgent) ? 'Safari' : null;
  const parts = [os, browser].filter(Boolean);
  return parts.length ? parts.join(' · ') : userAgent.slice(0, 40);
}
