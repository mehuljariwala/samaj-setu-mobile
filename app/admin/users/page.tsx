import Link from 'next/link';
import {
  ArrowLeft, Ban, ChevronRight, CirclePause, Clock3, Phone, RotateCcw, Search, Shield, UserRound, Users,
} from 'lucide-react';

import { AdminProfiles } from '@/components/app/admin-profiles';
import { AppShell } from '@/components/app/shell';
import { loadAdminPage } from '@/lib/data/guards';
import {
  ACCOUNT_FILTERS, listAccounts, listProfiles, type AccountFilter, type AccountRow,
} from '@/lib/data/users';
import { accountStatusWord } from '@/lib/activity-labels';
import { timeAgo, translator, type Lang, type T } from '@/lib/i18n';

const PAGE = 30;

/**
 * User management, two ways round. Profiles: every candidate, boys on one side
 * and girls on the other, filtered by stage, what is missing, city,
 * sub-community and age — so an admin can see at a glance what is going on
 * and what each family still has to do. Accounts: everyone who can sign in,
 * where an admin enables, blocks or resets a password.
 *
 * The URL holds every filter, so a view can be shared between volunteers.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, lang } = await loadAdminPage();
  const params = await searchParams;
  const t = translator(lang);
  const view = params.view === 'accounts' ? 'accounts' : 'profiles';

  return (
    <AppShell lang={lang} context={context} admin>
      <section className="admin-screen admin-users tone-rose">
        <div className="admin-detail-top">
          <Link className="round-button" href="/admin" aria-label={t('ડેશબોર્ડ પર પાછા', 'Back to dashboard')}>
            <ArrowLeft size={20} />
          </Link>
          <span>{t('યુઝર મેનેજમેન્ટ', 'User management')}</span>
        </div>

        <nav className="admin-tabs view-tabs" aria-label={t('દૃશ્ય', 'View')}>
          <Link href="/admin/users" className={view === 'profiles' ? 'on' : undefined} aria-current={view === 'profiles' ? 'page' : undefined}>
            <UserRound size={16} />{t('પ્રોફાઇલ', 'Profiles')}
          </Link>
          <Link href="/admin/users?view=accounts" className={view === 'accounts' ? 'on' : undefined} aria-current={view === 'accounts' ? 'page' : undefined}>
            <Users size={16} />{t('એકાઉન્ટ અને પાસવર્ડ', 'Accounts & passwords')}
          </Link>
        </nav>

        {view === 'profiles'
          ? <ProfilesView lang={lang} params={params} />
          : <AccountsView lang={lang} params={params} />}

        <p className="admin-privacy">
          <Shield size={15} />{' '}
          {t('દરેક ફેરફાર અને પાસવર્ડ રીસેટ કોણે કર્યો તે નોંધાય છે.', 'Every change and password reset is recorded with who made it.')}
        </p>
      </section>
    </AppShell>
  );
}

type Params = Record<string, string | string[] | undefined>;

/** Everyone who can sign in, newest activity first. */
async function AccountsView({ lang, params }: { lang: Lang; params: Params }) {
  const t = translator(lang);
  const filter: AccountFilter = ACCOUNT_FILTERS.includes(params.tab as AccountFilter)
    ? params.tab as AccountFilter
    : 'all';
  const query = typeof params.q === 'string' ? params.q : undefined;
  const shown = Math.min(Math.max(Number(params.n) || PAGE, PAGE), 300);

  const list = await listAccounts({ query, filter, limit: shown });
  const { counts } = list;
  const off = counts.disabled + counts.blocked;

  const tabs: { key: AccountFilter; label: string; count: number }[] = [
    { key: 'all', label: t('બધા', 'All'), count: counts.all },
    { key: 'active', label: t('ચાલુ', 'Active'), count: counts.active },
    { key: 'disabled', label: t('બંધ', 'Disabled'), count: counts.disabled },
    { key: 'blocked', label: t('બ્લૉક', 'Blocked'), count: counts.blocked },
    { key: 'staff', label: t('સ્ટાફ', 'Staff'), count: counts.staff },
  ];
  const hrefFor = (key: AccountFilter, extra: Record<string, string | number> = {}) => {
    const search = new URLSearchParams({ view: 'accounts' });
    if (key !== 'all') search.set('tab', key);
    if (query) search.set('q', query);
    for (const [name, value] of Object.entries(extra)) search.set(name, String(value));
    const text = search.toString();
    return `/admin/users${text ? `?${text}` : ''}`;
  };

  return (
    <>
        <div className="admin-hero">
          <div className="admin-hero-copy">
            <span className="admin-hello"><Users size={15} />{t('યુઝર્સ', 'Users')}</span>
            <h1>
              {counts.all === 1
                ? t('1 એકાઉન્ટ', '1 account')
                : t(`${counts.all} એકાઉન્ટ`, `${counts.all} accounts`)}
            </h1>
            <p>
              {off > 0
                ? t(`${off} હાલ બંધ છે. કોઈ પર ટૅપ કરીને ચાલુ, બંધ, બ્લૉક કરો અથવા નવો પાસવર્ડ આપો.`,
                  `${off} switched off. Tap anyone to enable, disable, block or set a new password.`)
                : t('બધા લૉગ ઇન કરી શકે છે. કોઈ પર ટૅપ કરીને તેમની પ્રવૃત્તિ જુઓ.',
                  'Everyone can sign in. Tap anyone to see what they have been doing.')}
            </p>
          </div>
          <span className="admin-dial" aria-hidden="true">
            <b>{counts.active}</b>
            <small>{t('ચાલુ', 'active')}</small>
          </span>
        </div>

        <search>
          <form className="admin-search" action="/admin/users">
            <input type="hidden" name="view" value="accounts" />
            {filter !== 'all' && <input type="hidden" name="tab" value={filter} />}
            <Search size={19} />
            <input
              name="q"
              type="search"
              defaultValue={query}
              placeholder={t('નામ, નંબર અથવા SS-કોડ શોધો', 'Search name, phone or SS-code')}
              aria-label={t('શોધો', 'Search')}
              enterKeyHint="search"
            />
          </form>
        </search>

        <nav className="admin-tabs users-tabs" aria-label={t('યુઝર ફિલ્ટર', 'User filter')}>
          {tabs.map((item) => (
            <Link
              key={item.key}
              href={hrefFor(item.key)}
              className={filter === item.key ? 'on' : undefined}
              aria-current={filter === item.key ? 'page' : undefined}
            >
              {item.label}
              {item.count ? <i>{item.count}</i> : null}
            </Link>
          ))}
        </nav>

        {list.rows.length === 0 ? (
          <div className="admin-empty">
            <h2>{t('કોઈ મળ્યું નહીં', 'No one found')}</h2>
            <p>
              {query
                ? t(`“${query}” સાથે કોઈ એકાઉન્ટ મેળ ખાતું નથી.`, `No account matches “${query}”.`)
                : t('આ ટૅબમાં હાલ કોઈ નથી.', 'Nobody is in this tab right now.')}
            </p>
            {query && <Link className="intro-login" href={filter === 'all' ? '/admin/users?view=accounts' : `/admin/users?view=accounts&tab=${filter}`}><RotateCcw size={17} /><b>{t('શોધ સાફ કરો', 'Clear search')}</b></Link>}
          </div>
        ) : (
          <ul className="admin-queue">
            {list.rows.map((row, i) => (
              <li key={row.id} style={{ '--i': Math.min(i, 8) } as React.CSSProperties}>
                <UserRow row={row} t={t} lang={lang} />
              </li>
            ))}
          </ul>
        )}

        {list.total > list.rows.length && (
          <Link className="users-more" href={hrefFor(filter, { n: shown + PAGE })} scroll={false}>
            {t(`વધુ બતાવો (${list.total - list.rows.length} બાકી)`, `Show more (${list.total - list.rows.length} more)`)}
          </Link>
        )}

    </>
  );
}


function UserRow({ row, t, lang }: { row: AccountRow; t: T; lang: 'gu' | 'en' }) {
  const name = row.display_name || row.candidates[0]?.full_name || t('નામ નથી', 'No name yet');
  const staffRole = row.roles.includes('superadmin') ? 'superadmin'
    : row.roles.includes('admin') ? 'admin'
      : row.roles.includes('moderator') ? 'moderator' : null;
  const off = row.status !== 'active';

  return (
    <Link className={`admin-row user-row status-${row.status}`} href={`/admin/users/${row.id}`}>
      <div className="admin-row-top">
        <span className="avatar">{name.charAt(0)}</span>
        <span className="admin-row-name">
          <b>{name}</b>
          <small><Phone size={12} /> +91 {row.phone}</small>
        </span>
        {off && (
          <span className={`user-status ${row.status}`}>
            {row.status === 'blocked' ? <Ban size={13} /> : <CirclePause size={13} />}
            {accountStatusWord(t, row.status)}
          </span>
        )}
        <ChevronRight size={19} className="admin-row-go" />
      </div>
      <div className="admin-facts">
        {staffRole && (
          <span className="staff">
            <Shield size={13} />
            {staffRole === 'superadmin' ? t('સુપરએડમિન', 'Superadmin') : staffRole === 'admin' ? t('એડમિન', 'Admin') : t('મૉડરેટર', 'Moderator')}
          </span>
        )}
        {row.candidates.slice(0, 2).map((candidate) => (
          <span key={candidate.id}><UserRound size={13} />{candidate.full_name.split(' ')[0]} · {candidate.public_code}</span>
        ))}
        {row.candidates.length > 2 && <span>+{row.candidates.length - 2}</span>}
        <span><Clock3 size={13} />{row.last_active_at || row.last_sign_in_at ? timeAgo(row.seen, lang) : t('હજી લૉગ ઇન નથી', 'Never active')}</span>
      </div>
    </Link>
  );
}

/* ---------------------------------------------------------------- profiles */

/** Boys on one side, girls on the other, under one set of filters (AdminProfiles). */
async function ProfilesView({ lang, params }: { lang: Lang; params: Params }) {
  const query = typeof params.q === 'string' && params.q ? params.q : undefined;
  return <AdminProfiles lang={lang} rows={await listProfiles(query)} />;
}
