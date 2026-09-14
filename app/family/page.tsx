import Link from 'next/link';
import { ArrowRight, LockKeyhole, Plus, ShieldCheck, Users } from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import {
  ConsentControl, PauseControl, PrivacyControls, ShareLinkControl, SwitchCandidate,
} from '@/components/app/family-controls';
import { SignOutButton } from '@/components/app/sign-out-button';
import { loadMemberPage } from '@/lib/data/guards';
import { getCandidateSettings } from '@/lib/data/biodata';
import { translator } from '@/lib/i18n';

/**
 * Spec §6: managed candidates, linked accounts, consent, privacy, pause,
 * match-found and deletion controls.
 *
 * Each candidate carries its own state — a parent can have one child published
 * and another still in review — so the controls are rendered per candidate
 * rather than once for the account.
 */
export default async function FamilyPage() {
  const { context, lang, acting } = await loadMemberPage();
  const t = translator(lang);

  const settings = acting ? await getCandidateSettings(acting.id) : null;

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="screen-pad">
        <div className="page-title">
          <span className="eyebrow">{t('તમારો પરિવાર', 'Your family')}</span>
          <h1>{t('તમે જેમને સંભાળો છો', 'The people you manage')}</h1>
          <p>{t('દરેક ઉમેદવારની ચકાસણી, સંમતિ અને ગોપનીયતા અલગ છે.', 'Each candidate has their own verification, consent and privacy.')}</p>
        </div>

        {context.candidates.map((candidate) => (
          <div className="card row-card" key={candidate.id}>
            <span className="avatar lg">{candidate.full_name.charAt(0)}</span>
            <div>
              <b>{candidate.full_name}</b>
              <small>
                {candidate.public_code} ·{' '}
                {candidate.discoverable
                  ? t('પ્રકાશિત', 'Published')
                  : candidate.paused
                    ? t('થોભાવેલી', 'Paused')
                    : candidate.identity_status !== 'verified'
                      ? t('ચકાસણી બાકી', 'Awaiting verification')
                      : !candidate.consent_active
                        ? t('સંમતિ બાકી', 'Awaiting consent')
                        : t('પ્રકાશિત નથી', 'Not published')}
                {candidate.biodata ? ` · ${candidate.biodata.completion}% ${t('પૂર્ણ', 'complete')}` : ''}
              </small>
              <SwitchCandidate
                lang={lang}
                candidateId={candidate.id}
                active={candidate.id === acting?.id}
              />
            </div>
          </div>
        ))}

        {/* Spec §4: each additional child is a separate verification, never a
            second profile for someone who already has one. */}
        <Link className="secondary" href="/register">
          <Plus size={17} />
          {t('બીજા ઉમેદવારની નોંધણી કરો', 'Register another candidate')}
        </Link>
        <Link className="text-button muted center" href="/family/link">
          {t('પહેલેથી હાજર પ્રોફાઇલ સાથે જોડાઓ', 'Link to an existing profile')}
        </Link>

        {acting && settings && (
          <>
            <div className="section-head">
              <h2>{acting.full_name}</h2>
              <span>{t('સેટિંગ્સ', 'Settings')}</span>
            </div>

            <Link className="primary" href="/biodata">
              {t('બાયોડેટા સંભાળો', 'Manage biodata')}
              <ArrowRight size={18} />
            </Link>

            <div className="section-head">
              <h2>{t('પ્રકાશન સંમતિ', 'Publication consent')}</h2>
            </div>
            <ConsentControl lang={lang} candidate={acting} />

            <div className="section-head">
              <h2>{t('ગોપનીયતા', 'Privacy')}</h2>
            </div>
            {settings.privacy && (
              <PrivacyControls
                lang={lang}
                candidateId={acting.id}
                privacy={settings.privacy}
              />
            )}

            <div className="section-head">
              <h2>{t('પ્રોફાઇલ શેર કરો', 'Share this profile')}</h2>
            </div>
            {acting.discoverable ? (
              <ShareLinkControl lang={lang} candidateId={acting.id} />
            ) : (
              <div className="note">
                <LockKeyhole size={19} />
                <p>{t('પ્રકાશિત પ્રોફાઇલ જ શેર કરી શકાય છે.', 'Only a published profile can be shared.')}</p>
              </div>
            )}

            <div className="section-head">
              <h2>{t('પ્રોફાઇલ થોભાવો', 'Pause')}</h2>
            </div>
            <PauseControl lang={lang} candidate={acting} />

            {/* Spec §6: linked accounts are listed so a family can see exactly
                who can act for this candidate. */}
            <div className="section-head">
              <h2>{t('જોડાયેલા ખાતાં', 'Linked accounts')}</h2>
              <span>{settings.memberships.length}</span>
            </div>
            {settings.memberships.map((membership) => (
              <div className="card row-card" key={membership.id}>
                <span className="avatar"><Users size={18} /></span>
                <div>
                  <b>
                    {membership.role === 'candidate'
                      ? t('ઉમેદવાર પોતે', 'The candidate themselves')
                      : t('વાલી', 'Guardian')}
                  </b>
                  <small>{membership.relationship}</small>
                </div>
              </div>
            ))}
          </>
        )}

        <div className="trust-card neutral">
          <ShieldCheck size={24} strokeWidth={1.5} />
          <div>
            <h3>{t('તમારો નિયંત્રણ', 'You stay in control')}</h3>
            <p>
              {t(
                'સંમતિ પાછી ખેંચવી, થોભાવવું અને ગોપનીયતા બદલવી તરત અસર કરે છે. પણ જે કોઈએ પહેલેથી જોઈ લીધું હોય તે પાછું લઈ શકાતું નથી.',
                'Withdrawing consent, pausing and privacy changes take effect at once. What someone has already seen cannot be taken back.',
              )}
            </p>
          </div>
        </div>

        <SignOutButton lang={lang} />
      </section>
    </AppShell>
  );
}
