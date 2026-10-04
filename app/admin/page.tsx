import Link from 'next/link';
import {
  AlarmClock, Check, ChevronRight, Clock3, CopyCheck, EyeOff, FileText, Hourglass, Pencil, RotateCcw,
  Search, Shield, Users, X, type LucideIcon,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { AdminCaughtUpArt } from '@/components/onboarding/art';
import { loadAdminPage } from '@/lib/data/guards';
import { getFamilyCounts, getFamilyQueue, type FamilyFilter } from '@/lib/data/admin';
import { reviewSla, slaLabel } from '@/lib/admin-labels';
import { timeAgo, translator, type Lang, type T } from '@/lib/i18n';

const FILTERS: FamilyFilter[] = ['review', 'overdue', 'family', 'live', 'all'];
/** Rows per "Show more". The whole samaj fits in a few taps. */
const PAGE = 50;

type Row = Awaited<ReturnType<typeof getFamilyQueue>>[number];

/**
 * The admin's home: one list of every family, at the stage it has really
 * reached.
 *
 * User management first, then search, one row of filters with their counts,
 * and the list, so the most families fit on a phone screen. Each row wears one tag saying where
 * the family stands across both the registration and the biodata — the two
 * used to live in separate lists, and a family approved in one looked done
 * while it waited in the other. A row opens the page that needs the admin:
 * the registration for an approval, the biodata for a biodata.
 *
 * The list never shows a certificate — not as a thumbnail, not as a filename.
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

  const filter = FILTERS.find((key) => key === params.tab) ?? 'review';
  const query = typeof params.q === 'string' && params.q.trim() ? params.q : undefined;
  const page = Math.min(10, Math.max(1, Number(params.page) || 1));
  const limit = PAGE * page;

  const [counts, rows] = await Promise.all([
    getFamilyCounts(),
    getFamilyQueue({ filter, query, limit }),
  ]);

  const hrefFor = (key: FamilyFilter, nextPage = 1) => {
    const search = new URLSearchParams();
    if (key !== 'review') search.set('tab', key);
    if (query) search.set('q', query);
    if (nextPage > 1) search.set('page', String(nextPage));
    const qs = search.toString();
    return qs ? `/admin?${qs}` : '/admin';
  };

  const chips: { key: FamilyFilter; label: string }[] = [
    { key: 'review', label: t('મંજૂર કરવાના', 'To approve') },
    { key: 'overdue', label: t('મોડું', 'Overdue') },
    { key: 'family', label: t('પરિવારની રાહ', 'Waiting on family') },
    { key: 'live', label: t('પ્રકાશિત', 'Live') },
    { key: 'all', label: t('બધા', 'All') },
  ];

  return (
    <AppShell lang={lang} context={context} admin>
      <section className="admin-screen admin-home tone-rose">
        {/* Account work is the other half of the admin's day, so it sits first. */}
        <Link className="admin-link-row" href="/admin/users">
          <span className="admin-account-icon"><Users size={18} /></span>
          <span>
            <b>{t('યુઝર મેનેજમેન્ટ', 'User management')}</b>
            <small>{t('ચાલુ / બંધ / બ્લૉક, પાસવર્ડ રીસેટ, પ્રવૃત્તિ', 'Enable, disable, block, reset passwords, activity')}</small>
          </span>
          <ChevronRight size={19} />
        </Link>

        {/* A plain GET form: works without JavaScript, and the URL is the state. */}
        <search>
          <form className="admin-search" action="/admin">
            {filter !== 'review' && <input type="hidden" name="tab" value={filter} />}
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

        {/* The counts are the filters, so a tap on "Overdue" is the list. */}
        <nav className="family-chips" aria-label={t('પરિવાર ફિલ્ટર', 'Family filter')}>
          {chips.map((chip) => (
            <Link
              key={chip.key}
              href={hrefFor(chip.key)}
              className={[
                filter === chip.key ? 'on' : '',
                chip.key === 'overdue' && counts.overdue > 0 ? 'hot' : '',
              ].filter(Boolean).join(' ') || undefined}
              aria-current={filter === chip.key ? 'page' : undefined}
            >
              {chip.label}
              <i>{counts[chip.key] ?? 0}</i>
            </Link>
          ))}
        </nav>

        {counts.duplicates_open > 0 && (
          <p className="admin-alert">
            <CopyCheck size={18} />
            {t(
              `${counts.duplicates_open} સંભવિત ડુપ્લિકેટ ઉકેલવાના બાકી છે — ત્યાં સુધી તે અરજી મંજૂર થઈ શકશે નહીં.`,
              `${counts.duplicates_open} possible duplicate(s) to resolve — those applications can’t be approved until then.`,
            )}
          </p>
        )}

        {rows.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty-stage"><AdminCaughtUpArt /></div>
            <h2>
              {query
                ? t('કોઈ મળ્યું નહીં', 'No one found')
                : filter === 'review' ? t('બધું પૂરું થઈ ગયું', 'You’re all caught up') : t('અહીં કોઈ નથી', 'No one here')}
            </h2>
            <p>
              {query
                ? t(`“${query}” માટે કોઈ પરિવાર નથી.`, `No family matches “${query}”.`)
                : t('નવી અરજી આવશે ત્યારે અહીં દેખાશે.', 'New applications appear here as they arrive.')}
            </p>
            {query && <Link className="intro-login" href={hrefFor(filter)}><RotateCcw size={17} /><b>{t('શોધ સાફ કરો', 'Clear search')}</b></Link>}
          </div>
        ) : (
          <ul className="queue-list">
            {rows.map((row, i) => {
              const tag = familyTag(t, lang, row);
              const href = rowHref(row);
              return (
                <li key={row.candidate_id!} style={{ '--i': Math.min(i, 8) } as React.CSSProperties}>
                  <Link className="queue-row" href={href}>
                    <span className="avatar">{row.full_name?.charAt(0)}</span>
                    <span className="queue-row-body">
                      <b>{row.full_name}</b>
                      {/* Only what changes the next step is named; a certificate
                          on file is the normal case and goes unsaid. */}
                      <small>
                        {row.public_code}
                        {row.city && ` · ${row.city}`}
                        {identityStage(row.stage) && !row.has_certificate && <> · <em>{t('પ્રમાણપત્ર નથી', 'No certificate')}</em></>}
                        {(row.open_duplicates ?? 0) > 0 && <> · <em>{t('ડુપ્લિકેટ', 'Duplicate')} {row.open_duplicates}</em></>}
                        {identityStage(row.stage) && (row.resubmit_count ?? 0) > 0 && ` · ${t(`${row.resubmit_count}× ફરી મોકલી`, `Resent ${row.resubmit_count}×`)}`}
                      </small>
                      <span className={`queue-tag ${tag.tone}`}>
                        <tag.Icon size={14} strokeWidth={2.4} />
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

        {rows.length === limit && (
          <Link className="secondary show-more" href={hrefFor(filter, page + 1)} scroll={false}>
            {t('વધુ બતાવો', 'Show more')}
          </Link>
        )}

        <p className="admin-privacy">
          <Shield size={15} />{' '}
          {t('દસ્તાવેજ ફક્ત ચકાસણી માટે ખોલો. દરેક વખત નોંધાય છે.', 'Open documents only to verify. Every view is recorded.')}
        </p>
      </section>
    </AppShell>
  );
}

/** The stages that are about the registration, where its facts matter. */
function identityStage(stage: string | null) {
  return stage === 'identity_review' || stage === 'identity_fix' || stage === 'not_sent';
}

/** The page that needs the admin for this family. */
function rowHref(row: Row) {
  switch (row.stage) {
    case 'biodata_review':
    case 'biodata_fix':
    case 'biodata_rejected':
      return `/admin/publication/${row.revision_id}`;
    case 'live':
    case 'hidden':
      return row.published_revision_id ? `/admin/publication/${row.published_revision_id}` : `/admin/registrations/${row.application_id}`;
    default:
      return `/admin/registrations/${row.application_id}`;
  }
}

/**
 * The one tag a row wears, in the colour of where the family stands. While a
 * registration waits on us it is the clock against the 24-hour target.
 */
function familyTag(t: T, lang: Lang, row: Row): { tone: string; Icon: LucideIcon; label: string } {
  switch (row.stage) {
    case 'identity_review': {
      const sla = reviewSla(row.submitted_at, row.review_due_at, row.overdue);
      return {
        tone: sla.state === 'overdue' ? 'bad' : sla.state === 'soon' ? 'gold' : 'ok',
        Icon: sla.state === 'overdue' ? AlarmClock : Hourglass,
        label: `${t('મંજૂરી બાકી', 'To approve')} · ${slaLabel(t, sla)}`,
      };
    }
    case 'biodata_review':
      return {
        tone: 'gold',
        Icon: FileText,
        label: `${t('બાયોડેટા મંજૂર કરવાનો', 'Biodata to approve')} · ${timeAgo(row.revision_submitted_at, lang)}`,
      };
    case 'identity_fix':
      return { tone: 'warn', Icon: Pencil, label: t('પરિવાર સુધારે છે', 'Family is fixing it') };
    case 'biodata_fix':
      return { tone: 'warn', Icon: Pencil, label: t('પરિવાર બાયોડેટા સુધારે છે', 'Family is fixing the biodata') };
    case 'not_sent':
      return { tone: 'muted', Icon: Clock3, label: t('હજી મોકલી નથી', 'Not sent yet') };
    case 'biodata_pending':
      return { tone: 'muted', Icon: Clock3, label: t('બાયોડેટા હજી મોકલ્યો નથી', 'Biodata not sent yet') };
    case 'identity_rejected':
      return { tone: 'bad', Icon: X, label: t('નામંજૂર', 'Rejected') };
    case 'biodata_rejected':
      return { tone: 'bad', Icon: X, label: t('બાયોડેટા નામંજૂર', 'Biodata rejected') };
    case 'live':
      return { tone: 'ok', Icon: Check, label: t('પ્રકાશિત', 'Live') };
    default:
      return { tone: 'muted', Icon: EyeOff, label: t('મંજૂર · છુપી', 'Approved · hidden') };
  }
}
