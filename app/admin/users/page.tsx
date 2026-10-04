import Link from 'next/link';
import {
  ArrowLeft, Ban, ChevronRight, CirclePause, Clock3, Phone, RotateCcw, Search, Shield, TriangleAlert, UserRound, Users,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { ProfileSelects } from '@/components/app/profile-selects';
import { fieldByKey } from '@/components/biodata/model';
import { loadAdminPage } from '@/lib/data/guards';
import {
  ACCOUNT_FILTERS, listAccounts, listProfiles, type AccountFilter, type AccountRow, type ProfileRow,
} from '@/lib/data/users';
import { accountStatusWord } from '@/lib/activity-labels';
import { familyTag, rowHref } from '@/lib/family-stages';
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

type StageFilter = 'all' | 'review' | 'family' | 'live' | 'rejected';
type Missing = 'not_sent' | 'documents' | 'biodata' | 'photo';
type AgeBand = 'u25' | '26-30' | '31-35' | '36+';

const STAGE_GROUPS: Record<Exclude<StageFilter, 'all'>, string[]> = {
  review: ['identity_review', 'biodata_review'],
  family: ['not_sent', 'identity_fix', 'biodata_pending', 'biodata_fix'],
  live: ['live'],
  rejected: ['identity_rejected', 'biodata_rejected'],
};
const MISSING: Missing[] = ['not_sent', 'documents', 'biodata', 'photo'];
const AGE_BANDS: AgeBand[] = ['u25', '26-30', '31-35', '36+'];

/**
 * What a profile still needs before it is complete, in the order a family
 * meets them. Documents only matter until the registration is approved.
 */
function missingFor(row: ProfileRow): Missing[] {
  const items: Missing[] = [];
  if (row.stage === 'not_sent') items.push('not_sent');
  if ((row.stage === 'not_sent' || row.stage === 'identity_fix') && !row.documents_complete) items.push('documents');
  if ((row.completion ?? 0) < 100 && row.stage !== 'live' && row.stage !== 'hidden') items.push('biodata');
  if (!row.has_photo) items.push('photo');
  return items;
}

function inAgeBand(age: number | null, band: AgeBand) {
  if (age === null) return false;
  if (band === 'u25') return age <= 25;
  if (band === '26-30') return age >= 26 && age <= 30;
  if (band === '31-35') return age >= 31 && age <= 35;
  return age >= 36;
}

/** Boys on one side, girls on the other, under one set of filters. */
async function ProfilesView({ lang, params }: { lang: Lang; params: Params }) {
  const t = translator(lang);
  const one = (key: string) => (typeof params[key] === 'string' && params[key] ? params[key] as string : undefined);

  const query = one('q');
  const stage = (['review', 'family', 'live', 'rejected'] as const).find((key) => key === one('stage')) ?? 'all';
  const missing = MISSING.find((key) => key === one('missing'));
  const city = one('city');
  const community = one('community');
  const age = AGE_BANDS.find((key) => key === one('age'));

  const rows = await listProfiles(query);

  // Each filter's counts are taken with every *other* filter applied, so a
  // chip says how many it would show if tapped.
  const passes = (row: ProfileRow, skip?: 'stage' | 'missing') =>
    (skip === 'stage' || stage === 'all' || STAGE_GROUPS[stage].includes(row.stage ?? ''))
    && (skip === 'missing' || !missing || missingFor(row).includes(missing))
    && (!city || row.city === city)
    && (!community || row.sub_community === community)
    && (!age || inAgeBand(row.age, age));

  const shown = rows.filter((row) => passes(row));
  // Three groups: boys, girls of the samaj, and Sanatan daughters from outside
  // it — a Sanatan daughter is counted only in her own tab.
  const groups = {
    boys: shown.filter((row) => row.gender === 'male' && !row.is_sanatan),
    girls: shown.filter((row) => row.gender === 'female' && !row.is_sanatan),
    sanatan: shown.filter((row) => row.is_sanatan),
  };
  const side = (['boys', 'girls', 'sanatan'] as const).find((key) => key === one('side')) ?? 'boys';

  const stageCount = (key: StageFilter) =>
    rows.filter((row) => passes(row, 'stage') && (key === 'all' || STAGE_GROUPS[key].includes(row.stage ?? ''))).length;
  const missingCount = (key: Missing) =>
    rows.filter((row) => passes(row, 'missing') && missingFor(row).includes(key)).length;

  // The URL as it stands, for links that change one filter and keep the rest.
  const current: Record<string, string> = {};
  for (const key of ['q', 'side', 'stage', 'missing', 'city', 'community', 'age']) {
    const value = one(key);
    if (value) current[key] = value;
  }
  const hrefWith = (key: string, value?: string) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    return qs ? `/admin/users?${qs}` : '/admin/users';
  };
  const filtered = Object.keys(current).some((key) => key !== 'q' && key !== 'side');

  const communityField = fieldByKey.get('community');
  const communityLabel = (value: string) => {
    const option = communityField?.options?.find((entry) => entry[0] === value);
    return option ? t(option[1], option[2]) : value;
  };
  const cities = [...new Set(rows.map((row) => row.city).filter((value): value is string => Boolean(value)))].sort();
  const communities = [...new Set(rows.map((row) => row.sub_community).filter((value): value is string => Boolean(value)))];

  const stageChips: { key: StageFilter; label: string }[] = [
    { key: 'all', label: t('બધા', 'All') },
    { key: 'review', label: t('મંજૂર કરવાના', 'To approve') },
    { key: 'family', label: t('પરિવારની રાહ', 'Waiting on family') },
    { key: 'live', label: t('પ્રકાશિત', 'Live') },
    { key: 'rejected', label: t('નામંજૂર', 'Rejected') },
  ];
  const missingLabel: Record<Missing, string> = {
    not_sent: t('હજી મોકલ્યું નથી', 'Not sent'),
    documents: t('દસ્તાવેજ', 'Documents'),
    biodata: t('બાયોડેટા', 'Biodata'),
    photo: t('ફોટો', 'Photo'),
  };

  return (
    <>
      <search>
        <form className="admin-search" action="/admin/users">
          {Object.entries(current).filter(([key]) => key !== 'q').map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
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

      <nav className="family-chips" aria-label={t('સ્થિતિ', 'Stage')}>
        {stageChips.map((chip) => (
          <Link
            key={chip.key}
            href={hrefWith('stage', chip.key === 'all' ? undefined : chip.key)}
            className={stage === chip.key ? 'on' : undefined}
            aria-current={stage === chip.key ? 'page' : undefined}
            scroll={false}
          >
            {chip.label}
            <i>{stageCount(chip.key)}</i>
          </Link>
        ))}
      </nav>

      <nav className="family-chips missing-chips" aria-label={t('શું ખૂટે છે', 'What is missing')}>
        <span className="missing-chips-label"><TriangleAlert size={14} />{t('ખૂટે છે:', 'Missing:')}</span>
        {MISSING.map((key) => (
          <Link
            key={key}
            href={hrefWith('missing', missing === key ? undefined : key)}
            className={missing === key ? 'on' : undefined}
            aria-current={missing === key ? 'page' : undefined}
            scroll={false}
          >
            {missingLabel[key]}
            <i>{missingCount(key)}</i>
          </Link>
        ))}
      </nav>

      <ProfileSelects
        lang={lang}
        params={current}
        cities={cities.map((value) => ({ value, label: value }))}
        communities={communities.map((value) => ({ value, label: communityLabel(value) }))}
        ages={[
          { value: 'u25', label: t('25 સુધી', 'Up to 25') },
          { value: '26-30', label: '26–30' },
          { value: '31-35', label: '31–35' },
          { value: '36+', label: '36+' },
        ]}
      />

      {filtered && (
        <Link className="intro-login profile-clear" href={query ? `/admin/users?q=${encodeURIComponent(query)}` : '/admin/users'} scroll={false}>
          <RotateCcw size={16} /><b>{t('ફિલ્ટર સાફ કરો', 'Clear filters')}</b>
        </Link>
      )}

      <nav className="admin-tabs side-tabs" aria-label={t('પ્રોફાઇલ જૂથ', 'Profile group')}>
        {([
          ['boys', t('છોકરાઓ', 'Boys')],
          ['girls', t('છોકરીઓ', 'Girls')],
          ['sanatan', t('સનાતન દીકરીઓ', 'Sanatan daughters')],
        ] as const).map(([key, label]) => (
          <Link
            key={key}
            href={hrefWith('side', key === 'boys' ? undefined : key)}
            className={`${side === key ? 'on' : ''} side-${key}`}
            aria-current={side === key ? 'page' : undefined}
            scroll={false}
          >
            {label}
            <i>{groups[key].length}</i>
          </Link>
        ))}
      </nav>

      {groups[side].length === 0 ? (
        <p className="gender-empty">{t('આ જૂથમાં કોઈ નથી', 'No one in this group')}</p>
      ) : (
        <ul className="profile-grid">
          {groups[side].map((row) => <ProfileMini key={row.candidate_id!} row={row} t={t} lang={lang} />)}
        </ul>
      )}
    </>
  );
}

/** One profile, small enough for half the screen: who, where, and what is left. */
function ProfileMini({ row, t, lang }: { row: ProfileRow; t: T; lang: Lang }) {
  const tag = familyTag(t, lang, row);
  // "Not sent" is already the tag, so the list names only what is left.
  const gaps = missingFor(row).filter((gap) => gap !== 'not_sent');
  const gapLabel: Record<Missing, string> = {
    not_sent: t('હજી મોકલ્યું નથી', 'Not sent yet'),
    documents: t('દસ્તાવેજ ખૂટે છે', 'Documents missing'),
    biodata: t(`બાયોડેટા ${row.completion ?? 0}%`, `Biodata ${row.completion ?? 0}%`),
    photo: t('ફોટો નથી', 'No photo'),
  };
  return (
    <li>
      <Link className="profile-mini" href={rowHref(row)}>
        <b>{row.full_name}</b>
        <small>{[row.age !== null ? t(`${row.age} વર્ષ`, `${row.age} yrs`) : null, row.city].filter(Boolean).join(' · ')}</small>
        <small className="profile-mini-code">{row.public_code}</small>
        <span className={`queue-tag ${tag.tone}`}><tag.Icon size={13} strokeWidth={2.4} />{tag.label}</span>
        {gaps.length > 0 && (
          <span className="profile-mini-gaps">
            {gaps.map((gap) => (
              <em key={gap}>
                <TriangleAlert size={12} />
                {gapLabel[gap]}
              </em>
            ))}
          </span>
        )}
      </Link>
    </li>
  );
}
