import Link from 'next/link';
import { Bell, ChevronDown, Shield, Sprout } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';
import type { CandidateSummary, MyContext } from '@/lib/data/session';
import { LangToggle } from './lang-toggle';
import { SignOutButton } from './sign-out-button';
import { TabBar } from './tabbar';

type Props = {
  lang: Lang;
  context: MyContext;
  /** The candidate every candidate-scoped action on this screen applies to. */
  acting?: CandidateSummary | null;
  /** Member screens get the tab bar and the managing-profile selector. */
  member?: boolean;
  admin?: boolean;
  children: React.ReactNode;
};

/**
 * The app shell: a fixed top bar, one scrolling surface, and a fixed bottom tab
 * bar. Same markup and the same classes as the prototype, so `app/globals.css`
 * needed no changes — only where the data comes from has changed.
 */
export function AppShell({ lang, context, acting, member = false, admin = false, children }: Props) {
  const t = translator(lang);

  // Spec §2 keeps admin a separate role, so staff may hold no candidate at all
  // and would otherwise have no way back to the console from a member screen.
  const staff = context.roles.some(
    (role) => role === 'moderator' || role === 'admin' || role === 'superadmin',
  );

  const pendingInterests = context.candidates.reduce(
    (total, candidate) => total + candidate.pending_interests + candidate.pending_photo_requests,
    0,
  );

  return (
    <div className="app-frame">
      <div className="app">
        <header className="topbar">
          {member && acting ? (
            // Spec §6: the acting candidate stays visible, the way a delivery
            // app keeps the delivery address in the header rather than spending
            // a whole band on it.
            <Link className="topbar-managing" href="/family">
              <span className="avatar sm">{acting.full_name.charAt(0)}</span>
              <span>
                <small>{t('તમે સંભાળી રહ્યા છો', 'Managing')}</small>
                <b>
                  {acting.full_name}
                  <ChevronDown size={15} />
                </b>
              </span>
            </Link>
          ) : (
            <div className="topbar-brand">
              <Sprout size={22} strokeWidth={1.8} />
              <b>{admin ? t('એડમિન સેતુ', 'Admin Setu') : t('સમાજ સેતુ', 'Samaj Setu')}</b>
            </div>
          )}

          <div className="topbar-actions">
            {staff && !admin && (
              <Link className="icon-button" aria-label={t('એડમિન', 'Admin')} href="/admin">
                <Shield size={19} />
              </Link>
            )}
            <LangToggle lang={lang} />
            {context.account && <SignOutButton lang={lang} variant="icon" />}
            {member && (
              <Link
                className={`icon-button${context.unread_notifications > 0 ? ' dot' : ''}`}
                aria-label={t('સૂચનાઓ', 'Notifications')}
                href="/notifications"
              >
                <Bell size={20} />
                {context.unread_notifications > 0 && <i />}
              </Link>
            )}
          </div>
        </header>

        <div className="screen">{children}</div>

        {member && <TabBar lang={lang} pendingInterests={pendingInterests} />}
      </div>
    </div>
  );
}
