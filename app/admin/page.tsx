import Link from 'next/link';
import { ChevronRight, Clock3, FileCheck2, Shield, UserRound, Users } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { loadAdminPage } from '@/lib/data/guards';
import { getDashboard, getRegistrationQueue } from '@/lib/data/admin';
import { timeAgo, translator } from '@/lib/i18n';
import type { Enums } from '@/lib/supabase/database.types';

const OPEN: Enums<'application_status'>[] = ['submitted', 'under_review', 'correction_requested'];

/**
 * Spec §10's dashboard and registration queue: open work, approaching and
 * overdue targets, and corrections awaiting resubmission.
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

  const tab = params.tab === 'all' ? 'all' : 'open';
  const query = typeof params.q === 'string' ? params.q : undefined;

  const [dashboard, queue] = await Promise.all([
    getDashboard(),
    getRegistrationQueue({ statuses: tab === 'open' ? OPEN : undefined, query }),
  ]);

  return (
    <AppShell lang={lang} context={context} admin>
      <section className="screen-pad">
        <div className="page-title">
          <span className="eyebrow">{t('સમાજના વિશ્વાસની સંભાળ', 'Looking after our community')}</span>
          <h1>{t('નોંધણી સમીક્ષા', 'Registration review')}</h1>
          <p>{t('દરેક નવી શરૂઆત પાછળ એક પરિવાર છે.', 'Behind every application is a family.')}</p>
        </div>

        <div className="admin-stats">
          <div className={dashboard.verification.open > 0 ? 'hot' : ''}>
            <b>{dashboard.verification.open}</b>
            <span>{t('બાકી', 'Open')}</span>
          </div>
          <div className={dashboard.verification.overdue > 0 ? 'hot' : ''}>
            <b>{dashboard.verification.overdue}</b>
            <span>{t('મુદત વીતી', 'Overdue')}</span>
          </div>
          <div>
            <b>{dashboard.verification.awaiting_resubmission}</b>
            <span>{t('સુધારો', 'Correction')}</span>
          </div>
          <div>
            <b>{dashboard.duplicates_open}</b>
            <span>{t('ડુપ્લિકેટ', 'Duplicates')}</span>
          </div>
        </div>

        <div className="sla">
          <Clock3 size={16} />
          {t('દરેક અરજીની સમીક્ષા 24 કલાકમાં કરવાનો લક્ષ્ય', 'Aim to review every application within 24 hours')}
        </div>

        <div className="chips">
          <Link className={`chip ${tab === 'open' ? 'on' : ''}`} href="/admin">
            {t('ખુલ્લી', 'Needs action')}
          </Link>
          <Link className={`chip ${tab === 'all' ? 'on' : ''}`} href="/admin?tab=all">
            {t('બધી નોંધણી', 'All registrations')}
          </Link>
          <Link className="chip ghost" href="/admin/publication">
            {t('બાયોડેટા સમીક્ષા', 'Biodata review')} {dashboard.publication.open}
          </Link>
        </div>

        {/* Approved but invisible is the queue most easily forgotten. */}
        {dashboard.publication.awaiting_consent > 0 && (
          <div className="note">
            <Users size={19} />
            <p>
              {t(
                `${dashboard.publication.awaiting_consent} પ્રોફાઇલ મંજૂર છે પણ ઉમેદવારની સંમતિ બાકી હોવાથી દેખાતી નથી.`,
                `${dashboard.publication.awaiting_consent} profile(s) are approved but invisible, waiting on the candidate’s own consent.`,
              )}
            </p>
          </div>
        )}

        {queue.length === 0 ? (
          <div className="empty">
            <UserRound size={34} />
            <h3>{t('બાકી સમીક્ષા પૂર્ણ થઈ', 'You’re all caught up')}</h3>
            <p>{t('નવી અરજી આવશે ત્યારે અહીં દેખાશે.', 'New applications appear here as they arrive.')}</p>
          </div>
        ) : (
          queue.map((row) => (
            <Link className="queue-card card" key={row.application_id!} href={`/admin/registrations/${row.application_id}`}>
              <div className="queue-top">
                <span className="avatar">{row.full_name?.charAt(0)}</span>
                <span>
                  <b>{row.full_name}</b>
                  <small>{row.public_code}</small>
                </span>
                <ChevronRight size={19} />
              </div>
              <div className="queue-facts">
                <span>
                  <Users size={14} />
                  {row.relationship === 'self'
                    ? t('સ્વયં નોંધણી', 'Self registration')
                    : t('વાલી દ્વારા', 'Registered by a parent')}
                </span>
                <span>
                  <FileCheck2 size={14} />
                  {row.has_certificate
                    ? t('પ્રમાણપત્ર જોડાયેલું', 'Certificate attached')
                    : t('પ્રમાણપત્ર નથી', 'No certificate')}
                </span>
                {(row.open_duplicates ?? 0) > 0 && (
                  <span><Shield size={14} />{t('ડુપ્લિકેટ', 'Duplicate')} {row.open_duplicates}</span>
                )}
              </div>
              <div className="queue-foot">
                <span className={`badge ${row.overdue ? 'rejected' : 'pending'}`}>
                  {row.overdue ? t('મુદત વીતી', 'Overdue') : row.status}
                </span>
                <span>{timeAgo(row.submitted_at, lang)}</span>
              </div>
            </Link>
          ))
        )}

        <div className="trust-card neutral">
          <Shield size={24} strokeWidth={1.5} />
          <div>
            <h3>{t('ખાનગી દસ્તાવેજો', 'Private documents')}</h3>
            <p>{t('પ્રમાણપત્ર ફક્ત ચકાસણી માટે ખોલો. દરેક વખત નોંધાય છે.', 'Open a certificate only to verify. Every time is recorded.')}</p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
