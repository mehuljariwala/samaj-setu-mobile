import Link from 'next/link';
import { ArrowLeft, CheckCheck, ChevronRight, Clock3 } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { loadAdminPage } from '@/lib/data/guards';
import { getPublicationQueue } from '@/lib/data/admin';
import { timeAgo, translator } from '@/lib/i18n';

/** Spec §10: completed biodata, active consent evidence, field-level issues. */
export default async function PublicationQueuePage() {
  const { context, lang } = await loadAdminPage();
  const t = translator(lang);
  const queue = await getPublicationQueue();

  return (
    <AppShell lang={lang} context={context} admin>
      <section className="screen-pad">
        <Link className="back-link" href="/admin">
          <ArrowLeft size={17} />
          {t('નોંધણી પર પાછા', 'Back to registrations')}
        </Link>

        <div className="page-title">
          <span className="eyebrow">{t('પ્રકાશન સમીક્ષા', 'Publication review')}</span>
          <h1>{t('બાયોડેટા સમીક્ષા', 'Biodata review')}</h1>
          <p>{t('ઓળખ મંજૂરી અલગ છે — આ બીજી સમીક્ષા છે.', 'Identity approval is separate. This is the second review.')}</p>
        </div>

        {queue.length === 0 ? (
          <div className="empty">
            <CheckCheck size={34} />
            <h3>{t('કોઈ બાયોડેટા બાકી નથી', 'No biodata waiting')}</h3>
            <p>{t('સભ્ય બાયોડેટા મોકલશે ત્યારે અહીં દેખાશે.', 'They appear here as members submit them.')}</p>
          </div>
        ) : (
          queue.map((row) => (
            <Link className="queue-card card" key={row.revision_id!} href={`/admin/publication/${row.revision_id}`}>
              <div className="queue-top">
                <span className="avatar">{row.full_name?.charAt(0)}</span>
                <span>
                  <b>{row.full_name}</b>
                  <small>{row.public_code} · v{row.version}</small>
                </span>
                <ChevronRight size={19} />
              </div>
              <div className="queue-facts">
                <span><Clock3 size={14} />{timeAgo(row.submitted_at, lang)}</span>
                <span>{row.completion}% {t('પૂર્ણ', 'complete')}</span>
                <span>
                  {row.consent_active
                    ? t('સંમતિ સક્રિય', 'Consent active')
                    : t('સંમતિ બાકી', 'Awaiting consent')}
                </span>
              </div>
              <div className="queue-foot">
                <span className="badge pending">{row.status}</span>
                <span>{row.source}</span>
              </div>
            </Link>
          ))
        )}
      </section>
    </AppShell>
  );
}
