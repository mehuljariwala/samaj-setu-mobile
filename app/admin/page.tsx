import Link from 'next/link';
import {
  AlarmClock, Check, ChevronRight, CopyCheck, FileCheck2, Hourglass, Pencil, RotateCcw,
  Search, Shield, Sparkles, UserRound, Users, X, type LucideIcon,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { AdminCaughtUpArt } from '@/components/onboarding/art';
import { loadAdminPage } from '@/lib/data/guards';
import { getDashboard, getRegistrationQueue } from '@/lib/data/admin';
import { applicationStatusLabel, applicationStatusTone, reviewSla, slaLabel } from '@/lib/admin-labels';
import { translator, type T } from '@/lib/i18n';
import type { Enums } from '@/lib/supabase/database.types';

// "To do" is what an admin can act on. A correction is waiting on the family,
// so it lives under its own tab and never in this one.
const WAITING_ON_US: Enums<'application_status'>[] = ['submitted', 'under_review'];

type Tab = 'open' | 'overdue' | 'correction' | 'all';

/**
 * Spec §10's dashboard and registration queue: open work, approaching and
 * overdue targets, and corrections awaiting resubmission.
 *
 * Drawn in the onboarding style: one pastel panel that says how the day looks,
 * tiles that are also the filters, and a plain list where every family gets
 * one line of facts and one coloured tag saying where they stand.
 *
 * The queue never shows a certificate — not as a thumbnail, not as a filename.
 * It shows only that one exists.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, lang } = await loadAdminPage();
  const params = await searchParams;
  const t = translator(lang);

  const tab: Tab = params.tab === 'all' || params.tab === 'overdue' || params.tab === 'correction'
    ? params.tab
    : 'open';
  const query = typeof params.q === 'string' ? params.q : undefined;

  const [dashboard, queue] = await Promise.all([
    getDashboard(),
    getRegistrationQueue({
      statuses: tab === 'all' ? undefined
        : tab === 'correction' ? ['correction_requested']
          : WAITING_ON_US,
      overdueOnly: tab === 'overdue',
      query,
    }),
  ]);

  const { verification } = dashboard;
  const waiting = verification.open;
  const mood = verification.overdue > 0 ? 'bad' : verification.approaching > 0 ? 'gold' : waiting > 0 ? 'rose' : 'green';
  const firstName = context.account?.display_name?.split(' ')[0];

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'open', label: t('બાકી', 'To do'), count: verification.open },
    { key: 'overdue', label: t('મોડું', 'Overdue'), count: verification.overdue },
    { key: 'correction', label: t('સુધારો', 'Corrections'), count: verification.awaiting_resubmission },
    { key: 'all', label: t('બધી', 'All') },
  ];
  const hrefFor = (key: Tab) => (key === 'open' ? '/admin' : `/admin?tab=${key}`);

  return (
    <AppShell lang={lang} context={context} admin>
      <section className={`admin-screen tone-${mood}`}>
        {/* How the day looks, in one sentence and one number. */}
        <div className="admin-hero">
          <div className="admin-hero-copy">
            <span className="admin-hello">
              <Sparkles size={15} />
              {firstName ? t(`નમસ્તે, ${firstName}`, `Namaste, ${firstName}`) : t('નમસ્તે', 'Namaste')}
            </span>
            <h1>
              {waiting === 0
                ? t('આજનું કામ પૂરું!', 'All caught up!')
                : waiting === 1
                  ? t('1 પરિવાર રાહ જુએ છે', '1 family is waiting')
                  : t(`${waiting} પરિવાર રાહ જુએ છે`, `${waiting} families are waiting`)}
            </h1>
            <p>
              {verification.overdue > 0
                ? t(`${verification.overdue} અરજી 24 કલાકથી વધુ જૂની છે — પહેલાં તે જુઓ.`, `${verification.overdue} past the 24-hour target — start there.`)
                : verification.approaching > 0
                  ? t(`${verification.approaching} અરજીની મુદત નજીક છે.`, `${verification.approaching} close to the 24-hour target.`)
                  : waiting > 0
                    ? t('બધી અરજી સમયમર્યાદામાં છે.', 'Everything is inside the 24-hour target.')
                    : t('નવી અરજી આવશે ત્યારે અહીં દેખાશે.', 'New applications will appear here.')}
            </p>
          </div>
          <span className="admin-dial" aria-hidden="true">
            {verification.overdue > 0 && <span className="art-ripple" />}
            <b>{waiting}</b>
            <small>{t('બાકી', 'open')}</small>
          </span>
        </div>

        {/* The numbers double as filters, so a tap on "Overdue" is the list. */}
        <div className="admin-tiles">
          <Link href={hrefFor('overdue')} className={`admin-tile bad${verification.overdue ? ' hot' : ''}`} style={{ '--i': 0 } as React.CSSProperties}>
            <span><AlarmClock size={18} /></span>
            <b>{verification.overdue}</b>
            <small>{t('મોડું', 'Overdue')}</small>
          </Link>
          <Link href={hrefFor('open')} className={`admin-tile gold${verification.approaching ? ' hot' : ''}`} style={{ '--i': 1 } as React.CSSProperties}>
            <span><Hourglass size={18} /></span>
            <b>{verification.approaching}</b>
            <small>{t('મુદત નજીક', 'Due soon')}</small>
          </Link>
          <Link href={hrefFor('correction')} className="admin-tile warn" style={{ '--i': 2 } as React.CSSProperties}>
            <span><Pencil size={17} /></span>
            <b>{verification.awaiting_resubmission}</b>
            <small>{t('સુધારાની રાહ', 'Awaiting fix')}</small>
          </Link>
          <Link href="/admin/publication" className="admin-tile rose" style={{ '--i': 3 } as React.CSSProperties}>
            <span><FileCheck2 size={18} /></span>
            <b>{dashboard.publication.open}</b>
            <small>{t('બાયોડેટા', 'Biodata')}</small>
          </Link>
        </div>

        <Link className="admin-link-row" href="/admin/users">
          <span className="admin-account-icon"><Users size={18} /></span>
          <span>
            <b>{t('યુઝર મેનેજમેન્ટ', 'User management')}</b>
            <small>{t('ચાલુ / બંધ / બ્લૉક, પાસવર્ડ રીસેટ, પ્રવૃત્તિ', 'Enable, disable, block, reset passwords, activity')}</small>
          </span>
          <ChevronRight size={19} />
        </Link>

        {dashboard.duplicates_open > 0 && (
          <p className="admin-alert">
            <CopyCheck size={18} />
            {t(
              `${dashboard.duplicates_open} સંભવિત ડુપ્લિકેટ ઉકેલવાના બાકી છે — ત્યાં સુધી તે અરજી મંજૂર થઈ શકશે નહીં.`,
              `${dashboard.duplicates_open} possible duplicate(s) to resolve — those applications can’t be approved until then.`,
            )}
          </p>
        )}

        {/* A plain GET form: works without JavaScript, and the URL is the state. */}
        <search>
          <form className="admin-search" action="/admin">
            {tab !== 'open' && <input type="hidden" name="tab" value={tab} />}
            <Search size={19} />
            <input
              name="q"
              type="search"
              defaultValue={query}
              placeholder={t('નામ, SS-કોડ અથવા નંબર શોધો', 'Search name, SS-code or phone')}
              aria-label={t('શોધો', 'Search')}
              enterKeyHint="search"
            />
          </form>
        </search>

        <nav className="admin-tabs" aria-label={t('નોંધણી ફિલ્ટર', 'Registration filter')}>
          {tabs.map((item) => (
            <Link
              key={item.key}
              href={hrefFor(item.key) + (query ? `${item.key === 'open' ? '?' : '&'}q=${encodeURIComponent(query)}` : '')}
              className={tab === item.key ? 'on' : undefined}
              aria-current={tab === item.key ? 'page' : undefined}
            >
              {item.label}
              {item.count ? <i>{item.count}</i> : null}
            </Link>
          ))}
        </nav>

        {queue.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-stage"><AdminCaughtUpArt /></div>
            <h2>
              {query
                ? t('કોઈ મળ્યું નહીં', 'No one found')
                : t('બધું પૂરું થઈ ગયું', 'You’re all caught up')}
            </h2>
            <p>
              {query
                ? t(`“${query}” માટે કોઈ અરજી નથી.`, `No application matches “${query}”.`)
                : t('નવી અરજી આવશે ત્યારે અહીં દેખાશે.', 'New applications appear here as they arrive.')}
            </p>
            {query && <Link className="intro-login" href={hrefFor(tab)}><RotateCcw size={17} /><b>{t('શોધ સાફ કરો', 'Clear search')}</b></Link>}
          </div>
        ) : (
          <ul className="queue-list">
            {queue.map((row, i) => {
              const tag = queueTag(t, row.status, row.submitted_at, row.review_due_at, row.overdue);
              return (
                <li key={row.application_id!} style={{ '--i': Math.min(i, 8) } as React.CSSProperties}>
                  <Link className="queue-row" href={`/admin/registrations/${row.application_id}`}>
                    <span className="avatar">{row.full_name?.charAt(0)}</span>
                    <span className="queue-row-body">
                      <b>{row.full_name}</b>
                      {/* Only what changes the next step is named; a certificate
                          on file is the normal case and goes unsaid. */}
                      <small>
                        {row.public_code}
                        {row.city && ` · ${row.city}`}
                        {!row.has_certificate && <> · <em>{t('પ્રમાણપત્ર નથી', 'No certificate')}</em></>}
                        {(row.open_duplicates ?? 0) > 0 && <> · <em>{t('ડુપ્લિકેટ', 'Duplicate')} {row.open_duplicates}</em></>}
                        {(row.resubmit_count ?? 0) > 0 && ` · ${t(`${row.resubmit_count}× ફરી મોકલી`, `Resent ${row.resubmit_count}×`)}`}
                      </small>
                      <span className={`queue-tag ${tag.tone}`}>
                        {tag.Icon && <tag.Icon size={14} strokeWidth={2.4} />}
                        {tag.label}
                      </span>
                    </span>
                    <ChevronRight size={19} className="queue-row-go" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* Approved but invisible is the queue most easily forgotten. */}
        {dashboard.publication.awaiting_consent > 0 && (
          <p className="admin-alert soft">
            <UserRound size={18} />
            {t(
              `${dashboard.publication.awaiting_consent} પ્રોફાઇલ મંજૂર છે પણ ઉમેદવારની સંમતિ બાકી હોવાથી દેખાતી નથી.`,
              `${dashboard.publication.awaiting_consent} profile(s) are approved but invisible, waiting on the candidate’s own consent.`,
            )}
          </p>
        )}

        <p className="admin-privacy">
          <Shield size={15} />{' '}
          {t('દસ્તાવેજ ફક્ત ચકાસણી માટે ખોલો. દરેક વખત નોંધાય છે.', 'Open documents only to verify. Every view is recorded.')}
        </p>
      </section>
    </AppShell>
  );
}

/**
 * The one tag a row wears. While the family waits on us it is the clock
 * against the 24-hour target; otherwise it is the status, in that status's
 * own colour — an approval is never drawn in the colour of a correction.
 */
function queueTag(
  t: T,
  status: Enums<'application_status'> | null,
  submittedAt: string | null,
  dueAt: string | null,
  overdue: boolean | null,
): { tone: string; Icon: LucideIcon | null; label: string } {
  if (status && WAITING_ON_US.includes(status)) {
    const sla = reviewSla(submittedAt, dueAt, overdue);
    if (sla.state !== 'none') {
      return {
        tone: sla.state === 'overdue' ? 'bad' : sla.state === 'soon' ? 'gold' : 'ok',
        Icon: sla.state === 'overdue' ? AlarmClock : Hourglass,
        label: slaLabel(t, sla),
      };
    }
  }
  const icons: Partial<Record<Enums<'application_status'>, LucideIcon>> = {
    correction_requested: Pencil, approved: Check, rejected: X,
  };
  return {
    tone: applicationStatusTone(status),
    Icon: (status && icons[status]) ?? null,
    label: applicationStatusLabel(t, status),
  };
}
