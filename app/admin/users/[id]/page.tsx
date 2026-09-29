import Link from 'next/link';
import {
  ArrowLeft, Ban, CalendarDays, CircleAlert, CirclePause, FileCheck2, KeyRound, Languages, LogIn, MessageCircle,
  Phone, Shield, ShieldCheck, ShieldX, UserRound,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { UserControls } from '@/components/app/user-controls';
import { isAdmin, loadAdminPage } from '@/lib/data/guards';
import { getAccount, getAccountActivity, type ActivityEntry } from '@/lib/data/users';
import { identityStatusLabel, relationshipLabel } from '@/lib/admin-labels';
import {
  accountStatusWord, activityLabel, activityNote, deviceLabel,
} from '@/lib/activity-labels';
import { timeAgo, translator, type Lang, type T } from '@/lib/i18n';

const ZONE = 'Asia/Kolkata';

/**
 * One account: who it is, what it looks after, the switches an admin may
 * flip, and everything it has done — screens opened, actions taken, sign-ins
 * that worked and ones that did not, and every decision staff made about it.
 */
export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, lang } = await loadAdminPage();
  const { id } = await params;
  const query = await searchParams;
  const before = typeof query.before === 'string' ? query.before : undefined;
  const t = translator(lang);

  const [account, activity] = await Promise.all([getAccount(id), getAccountActivity(id, before)]);
  const name = account.display_name || account.candidates[0]?.full_name || t('નામ નથી', 'No name yet');
  const staffRole = account.roles.includes('superadmin') ? t('સુપરએડમિન', 'Superadmin')
    : account.roles.includes('admin') ? t('એડમિન', 'Admin')
      : account.roles.includes('moderator') ? t('મૉડરેટર', 'Moderator') : null;
  const tone = account.status === 'blocked' ? 'bad' : account.status === 'active' ? 'green' : 'gold';
  const self = context.account?.id === account.id;

  const days = groupByDay(activity, lang);
  const oldest = activity.at(-1)?.occurred_at;

  return (
    <AppShell lang={lang} context={context} admin>
      <section className={`admin-screen tone-${tone}`}>
        <div className="admin-detail-top">
          <Link className="round-button" href="/admin/users" aria-label={t('યુઝર્સ પર પાછા', 'Back to users')}>
            <ArrowLeft size={20} />
          </Link>
          <span>{t('યુઝર', 'User')}</span>
        </div>

        <div className="admin-person">
          <span className="avatar lg">{name.charAt(0)}</span>
          <div>
            <small>+91 {account.phone}</small>
            <h1>{name}</h1>
            <span className="user-chips">
              <span className={`user-status ${account.status}`}>
                {account.status === 'blocked' ? <Ban size={13} />
                  : account.status === 'active' ? <ShieldCheck size={13} /> : <CirclePause size={13} />}
                {accountStatusWord(t, account.status)}
              </span>
              {staffRole && <span className="user-status staff"><Shield size={13} />{staffRole}</span>}
            </span>
          </div>
        </div>

        {account.status !== 'active' && account.status_reason && (
          <p className="admin-alert">
            <CircleAlert size={18} />
            <span><b>{t('કારણ: ', 'Reason: ')}</b>{account.status_reason}</span>
          </p>
        )}

        <div className="admin-accounts user-contact">
          <a className="admin-account" href={`tel:+91${account.phone}`}>
            <span className="admin-account-icon"><Phone size={17} /></span>
            <span><b>{t('ફોન કરો', 'Call')}</b><small>+91 {account.phone}</small></span>
          </a>
          <a className="admin-account" href={`https://wa.me/91${account.phone}`} target="_blank" rel="noopener noreferrer">
            <span className="admin-account-icon wa"><MessageCircle size={17} /></span>
            <span><b>WhatsApp</b><small>{t('સંદેશ મોકલો', 'Send a message')}</small></span>
          </a>
        </div>

        <h2 className="admin-h2">{t('એકાઉન્ટ', 'Account')}</h2>
        <dl className="admin-facts-card">
          <div><dt><CalendarDays size={16} />{t('જોડાયા', 'Joined')}</dt><dd>{formatWhen(account.created_at, lang)}</dd></div>
          <div>
            <dt><LogIn size={16} />{t('છેલ્લું લૉગ ઇન', 'Last sign-in')}</dt>
            <dd>{account.last_sign_in_at ? timeAgo(account.last_sign_in_at, lang) : '—'}<small>{t(`કુલ ${account.sign_ins} વાર`, `${account.sign_ins} in total`)}</small></dd>
          </div>
          <div>
            <dt><ShieldX size={16} />{t('ખોટા પાસવર્ડ (7 દિવસ)', 'Wrong passwords (7 days)')}</dt>
            <dd className={account.failed_sign_ins_week >= 5 ? 'bad' : undefined}>{account.failed_sign_ins_week}</dd>
          </div>
          <div>
            <dt><FileCheck2 size={16} />{t('નિયમો સ્વીકાર્યા', 'Rules accepted')}</dt>
            <dd>{account.rules_accepted_at ? formatWhen(account.rules_accepted_at, lang) : t('ના', 'No')}{account.rules_version && <small>{account.rules_version}</small>}</dd>
          </div>
          <div>
            <dt><KeyRound size={16} />{t('છેલ્લો પાસવર્ડ રીસેટ', 'Last password reset')}</dt>
            <dd>{account.last_password_reset_at ? timeAgo(account.last_password_reset_at, lang) : '—'}</dd>
          </div>
          <div><dt><Languages size={16} />{t('ભાષા', 'Language')}</dt><dd>{account.preferred_language === 'en' ? 'English' : 'ગુજરાતી'}</dd></div>
        </dl>

        <div className="admin-h2 with-count">
          <h2>{t('સંભાળતા ઉમેદવાર', 'Candidates they look after')}</h2>
          <span className="ok">{account.candidates.length}</span>
        </div>
        {account.candidates.length === 0 ? (
          <p className="admin-alert soft"><UserRound size={18} />{t('હજી કોઈ ઉમેદવાર નથી.', 'No candidates yet.')}</p>
        ) : (
          <div className="admin-accounts">
            {account.candidates.map((candidate) => (
              <div key={candidate.id} className="admin-account">
                <span className="avatar">{candidate.full_name.charAt(0)}</span>
                <span>
                  <b>{candidate.full_name}</b>
                  <small>{candidate.public_code} · {relationshipLabel(t, candidate.relationship)} · {identityStatusLabel(t, candidate.identity_status)}</small>
                </span>
                {candidate.discoverable
                  ? <em className="ok">{t('દેખાય છે', 'Visible')}</em>
                  : <em>{t('છુપાયેલ', 'Hidden')}</em>}
              </div>
            ))}
          </div>
        )}

        {account.can_manage ? (
          <UserControls
            lang={lang}
            accountId={account.id}
            phone={account.phone}
            name={account.display_name || account.candidates[0]?.full_name || null}
            status={account.status}
          />
        ) : (
          <p className="admin-alert soft">
            <Shield size={18} />
            {self
              ? t('તમે અહીંથી તમારું પોતાનું એકાઉન્ટ બદલી શકતા નથી.', 'You cannot change your own account here.')
              : !isAdmin(context)
                ? t('મૉડરેટર ફક્ત જોઈ શકે છે; ફેરફાર માટે એડમિન જોઈએ.', 'Moderators can look but not change; ask an admin.')
                : t('સ્ટાફ એકાઉન્ટ ફક્ત સુપરએડમિન બદલી શકે.', 'Only the superadmin can change a staff account.')}
          </p>
        )}

        <div className="admin-h2 with-count">
          <h2>{t('પ્રવૃત્તિ', 'Activity')}</h2>
          {before && <Link className="user-latest" href={`/admin/users/${account.id}`}>{t('નવીનતમ પર જાઓ', 'Back to latest')}</Link>}
        </div>

        {activity.length === 0 ? (
          <p className="admin-alert soft"><CalendarDays size={18} />{t('હજી કોઈ પ્રવૃત્તિ નોંધાઈ નથી.', 'Nothing recorded yet.')}</p>
        ) : (
          days.map((day) => (
            <div key={day.key} className="user-day">
              <h3>{day.label}</h3>
              <ol className="user-timeline">
                {day.entries.map((entry) => <ActivityItem key={entry.id} entry={entry} t={t} lang={lang} />)}
              </ol>
            </div>
          ))
        )}

        {oldest && activity.length >= 60 && (
          <Link className="users-more" href={`/admin/users/${account.id}?before=${encodeURIComponent(oldest)}`}>
            {t('જૂની પ્રવૃત્તિ બતાવો', 'Show older activity')}
          </Link>
        )}

        <p className="admin-privacy">
          <Shield size={15} />{' '}
          {t('પાસવર્ડ ક્યારેય નોંધાતો નથી. IP અને ડિવાઇસ ફક્ત સુરક્ષા માટે.', 'Passwords are never recorded. IP and device are kept for safety only.')}
        </p>
      </section>
    </AppShell>
  );
}

function ActivityItem({ entry, t, lang }: { entry: ActivityEntry; t: T; lang: Lang }) {
  const { title, tone } = activityLabel(t, entry);
  const note = activityNote(t, entry.detail);
  const device = deviceLabel(entry.user_agent);
  const who = entry.actor
    ? `${entry.actor.name ?? `+91 ${entry.actor.phone}`}`
    : null;

  return (
    <li className={`act-${tone}`}>
      <span aria-hidden="true" />
      <div>
        <p>
          <b>{title}</b>
          <time dateTime={entry.occurred_at}>{formatTime(entry.occurred_at, lang)}</time>
        </p>
        {(entry.target || entry.subject || entry.candidate) && (
          <small className="user-about">
            {entry.target
              ? <>{entry.target.name} · {entry.target.code}</>
              : entry.subject
                ? <Link href={`/admin/users/${entry.subject.id}`}>{entry.subject.name ?? `+91 ${entry.subject.phone}`}</Link>
                : <>{t('માટે: ', 'For ')}{entry.candidate!.name}</>}
          </small>
        )}
        {who && entry.actor && (
          <small className="user-by">
            {t('દ્વારા ', 'By ')}
            <Link href={`/admin/users/${entry.actor.id}`}>{who}</Link>
          </small>
        )}
        {note && <em>{note}</em>}
        {(device || entry.ip) && (
          <small className="user-device">{[device, entry.ip].filter(Boolean).join(' · ')}</small>
        )}
      </div>
    </li>
  );
}

function groupByDay(entries: ActivityEntry[], lang: Lang) {
  const t = translator(lang);
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONE });
  const today = dayOf(new Date().toISOString());
  const yesterday = dayOf(new Date(Date.now() - 86_400_000).toISOString());

  const days: { key: string; label: string; entries: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayOf(entry.occurred_at);
    let day = days.at(-1);
    if (!day || day.key !== key) {
      day = {
        key,
        label: key === today ? t('આજે', 'Today')
          : key === yesterday ? t('ગઈકાલે', 'Yesterday')
            : new Date(entry.occurred_at).toLocaleDateString(lang === 'gu' ? 'gu-IN' : 'en-IN', {
              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONE,
            }),
        entries: [],
      };
      days.push(day);
    }
    day.entries.push(entry);
  }
  return days;
}

function formatTime(iso: string, lang: Lang) {
  return new Date(iso).toLocaleTimeString(lang === 'gu' ? 'gu-IN' : 'en-IN', {
    hour: 'numeric', minute: '2-digit', timeZone: ZONE,
  });
}

function formatWhen(iso: string, lang: Lang) {
  return new Date(iso).toLocaleDateString(lang === 'gu' ? 'gu-IN' : 'en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: ZONE,
  });
}
