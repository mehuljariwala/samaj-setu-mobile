import Link from 'next/link';
import { ArrowLeft, Bell, ShieldCheck } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import { MarkAllRead } from '@/components/app/mark-all-read';
import { loadMemberPage } from '@/lib/data/guards';
import { listNotifications } from '@/lib/data/interests';
import { timeAgo, translator } from '@/lib/i18n';
import type { Enums } from '@/lib/supabase/database.types';
import type { T } from '@/lib/i18n';

/**
 * Spec §12: a notification carries identifiers and codes, never personal
 * details, and is never the source of truth for approval state. Every row here
 * is a prompt to open the real screen, which re-runs every authorisation check.
 */
export default async function NotificationsPage() {
  const { context, lang, acting } = await loadMemberPage();
  const t = translator(lang);

  const notifications = await listNotifications();
  const unread = notifications.filter((n) => !n.read_at).map((n) => n.id);

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="screen-pad">
        <Link className="back-link" href="/home">
          <ArrowLeft size={17} />
          {t('હોમ પર પાછા', 'Back to home')}
        </Link>

        <div className="page-title">
          <span className="eyebrow">{t('તમારા માટે', 'For you')}</span>
          <h1>{t('સૂચનાઓ', 'Notifications')}</h1>
        </div>

        {unread.length > 0 && <MarkAllRead lang={lang} ids={unread} />}

        {notifications.length === 0 ? (
          <div className="empty">
            <Bell size={34} />
            <h3>{t('હજી કંઈ નથી', 'Nothing yet')}</h3>
            <p>{t('તમારી અરજી કે પરિચય અંગે કંઈ થશે ત્યારે અહીં દેખાશે.', 'Anything that happens to your application or introductions appears here.')}</p>
          </div>
        ) : (
          notifications.map((notification) => {
            const { title, href } = describe(notification.kind, t);
            return (
              <div className="notif" key={notification.id}>
                <span className="avatar brandy"><ShieldCheck size={20} /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{timeAgo(notification.created_at, lang)}</p>
                  <Link className="text-button" href={href}>{t('ખોલો', 'Open')}</Link>
                </div>
              </div>
            );
          })
        )}
      </section>
    </AppShell>
  );
}

function describe(kind: Enums<'notification_kind'>, t: T): { title: string; href: string } {
  switch (kind) {
    case 'registration_submitted':
      return { title: t('અરજી મળી ગઈ છે', 'Your application has been received'), href: '/review' };
    case 'registration_decided':
      return { title: t('તમારી અરજી પર નિર્ણય લેવાયો છે', 'A decision has been made on your application'), href: '/review' };
    case 'biodata_decided':
      return { title: t('તમારા બાયોડેટા પર નિર્ણય લેવાયો છે', 'A decision has been made on your biodata'), href: '/biodata' };
    case 'access_request_decided':
      return { title: t('તમારી ઍક્સેસ વિનંતી પર નિર્ણય લેવાયો છે', 'Your access request has been decided'), href: '/family/link' };
    case 'interest_received':
      return { title: t('તમને નવો પરિચય મળ્યો છે', 'You have a new introduction'), href: '/interests?box=received' };
    case 'interest_responded':
      return { title: t('તમારા પરિચયનો જવાબ આવ્યો છે', 'Your introduction has a reply'), href: '/interests?box=sent' };
    case 'photo_request_received':
      return { title: t('ફોટો જોવાની વિનંતી આવી છે', 'Someone has asked to see photos'), href: '/interests?box=received' };
    case 'photo_request_decided':
      return { title: t('તમારી ફોટો વિનંતી પર નિર્ણય લેવાયો છે', 'Your photo request has been decided'), href: '/discover' };
    case 'review_overdue':
      return { title: t('સમીક્ષા અપેક્ષા કરતાં વધુ સમય લઈ રહી છે', 'A review is taking longer than expected'), href: '/review' };
  }
}
