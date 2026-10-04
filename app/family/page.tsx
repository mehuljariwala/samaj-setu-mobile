import Link from 'next/link';
import {
  ChevronRight, Eye, FileText, KeyRound, Link2, LockKeyhole, Pause, Plus, ShieldCheck, UserPlus, UserRound, Users,
} from 'lucide-react';

import { AppShell } from '@/components/app/shell';
import {
  PauseControl, PrivacyControls, ShareLinkControl, SwitchCandidate,
} from '@/components/app/family-controls';
import { SignOutButton } from '@/components/app/sign-out-button';
import { loadMemberPage } from '@/lib/data/guards';
import { getCandidateSettings } from '@/lib/data/biodata';
import { relationshipLabel } from '@/lib/admin-labels';
import { translator } from '@/lib/i18n';
import type { T } from '@/lib/i18n';
import type { CandidateSummary } from '@/lib/data/session';

/**
 * Spec §6: managed candidates, linked accounts, privacy, pause, match-found
 * and deletion controls. There is no consent switch: an admin's approval
 * publishes a profile, and pause is how a family takes it out of view.
 *
 * Each candidate carries its own state — a parent can have one child published
 * and another still in review — so the controls are rendered per candidate
 * rather than once for the account.
 */
export default async function FamilyPage() {
  const { context, lang, acting } = await loadMemberPage();
  const t = translator(lang);

  const settings = acting ? await getCandidateSettings(acting.id) : null;
  const firstName = acting?.full_name.split(' ')[0];

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <section className="member-screen tone-green">
        <div className="member-title">
          <h1>{t('તમારો પરિવાર', 'Your family')}</h1>
          <p>{t('દરેક ઉમેદવારની ચકાસણી અને ગોપનીયતા અલગ છે.', 'Each candidate has their own verification and privacy.')}</p>
        </div>

        <ul className="member-cards">
          {context.candidates.map((candidate, i) => {
            const status = candidateStatus(candidate, t);
            const active = candidate.id === acting?.id;
            return (
              <li key={candidate.id} style={{ '--i': i } as React.CSSProperties}>
                <article className={`member-person${active ? ' on' : ''}`}>
                  <div className="admin-row-top">
                    <span className="avatar">{candidate.full_name.charAt(0)}</span>
                    <span className="admin-row-name">
                      <b>{candidate.full_name}</b>
                      <small>{candidate.public_code} · {relationshipLabel(t, candidate.relationship)}</small>
                    </span>
                    <span className={`member-status ${status.tone}`}>{status.label}</span>
                  </div>
                  {candidate.biodata && (
                    <div className="member-progress">
                      <span className="admin-bar" aria-hidden="true">
                        <i style={{ '--used': candidate.biodata.completion / 100 } as React.CSSProperties} />
                      </span>
                      <small>{t(`બાયોડેટા ${candidate.biodata.completion}%`, `Biodata ${candidate.biodata.completion}%`)}</small>
                    </div>
                  )}
                  <div className="member-person-foot">
                    <SwitchCandidate lang={lang} candidateId={candidate.id} active={active} />
                  </div>
                </article>
              </li>
            );
          })}
        </ul>

        {/* Spec §4: each additional child is a separate verification, never a
            second profile for someone who already has one. */}
        <Link className="member-add" href="/register">
          <span><Plus size={20} /></span>
          <span>
            <b>{t('બીજા ઉમેદવારની નોંધણી કરો', 'Register another candidate')}</b>
            <small>{t('દરેક સંતાનની અલગ ચકાસણી થાય છે', 'Each child is verified on their own')}</small>
          </span>
          <ChevronRight size={19} />
        </Link>
        <Link className="intro-login" href="/family/link">
          <UserPlus size={17} />
          <b>{t('હાજર પ્રોફાઇલ સાથે જોડાઓ', 'Link to an existing profile')}</b>
        </Link>

        {acting && settings && (
          <>
            <h2 className="admin-h2">{t(`${firstName} માટે સેટિંગ્સ`, `Settings for ${firstName}`)}</h2>

            <Link className="member-add solid" href="/biodata">
              <span><FileText size={19} /></span>
              <span>
                <b>{t('બાયોડેટા', 'Biodata')}</b>
                <small>
                  {acting.biodata
                    ? t(`${acting.biodata.completion}% પૂર્ણ`, `${acting.biodata.completion}% complete`)
                    : t('હજી શરૂ નથી કર્યો', 'Not started yet')}
                </small>
              </span>
              <ChevronRight size={19} />
            </Link>

            {settings.privacy && (
              <div className="member-group">
                <GroupHead icon={<Eye size={18} />} title={t('ગોપનીયતા', 'Privacy')} note={t('ફોટા, જન્માક્ષર અને સંપર્ક — ત્રણેય અલગ', 'Photos, janmakshar and contact — each separate')} />
                <PrivacyControls lang={lang} candidateId={acting.id} privacy={settings.privacy} />
              </div>
            )}

            <div className="member-group">
              <GroupHead icon={<Link2 size={18} />} title={t('પ્રોફાઇલ શેર કરો', 'Share this profile')} note={t('ફક્ત ચકાસાયેલા સભ્યો ખોલી શકે', 'Only verified members can open it')} />
              {acting.discoverable ? (
                <ShareLinkControl lang={lang} candidateId={acting.id} />
              ) : (
                <p className="member-group-lock">
                  <LockKeyhole size={15} />
                  {t('પ્રકાશિત પ્રોફાઇલ જ શેર કરી શકાય છે.', 'Only a published profile can be shared.')}
                </p>
              )}
            </div>

            <div className="member-group">
              <GroupHead icon={<Pause size={18} />} title={t('વિરામ', 'Take a break')} note={t('થોભાવેલી પ્રોફાઇલ કોઈને દેખાતી નથી', 'A paused profile is hidden from everyone')} />
              <PauseControl lang={lang} candidate={acting} />
            </div>

            {/* Spec §6: linked accounts are listed so a family can see exactly
                who can act for this candidate. */}
            <div className="admin-h2 with-count">
              <h2>{t('જોડાયેલા ખાતાં', 'Linked accounts')}</h2>
              <span className="ok">{settings.memberships.length}</span>
            </div>
            <div className="admin-accounts">
              {settings.memberships.map((membership) => (
                <div className="admin-account" key={membership.id}>
                  <span className="admin-account-icon">
                    {membership.role === 'candidate' ? <UserRound size={18} /> : <Users size={18} />}
                  </span>
                  <span>
                    <b>
                      {membership.role === 'candidate'
                        ? t('ઉમેદવાર પોતે', 'The candidate')
                        : t('વાલી', 'Guardian')}
                    </b>
                    <small>{relationshipLabel(t, membership.relationship)}</small>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="admin-privacy">
          <ShieldCheck size={15} />{' '}
          {t(
            'વિરામ અને ગોપનીયતાના ફેરફાર તરત અસર કરે છે. પણ જે કોઈએ પહેલેથી જોઈ લીધું હોય તે પાછું લઈ શકાતું નથી.',
            'Pause and privacy changes take effect at once. What someone has already seen cannot be taken back.',
          )}
        </p>

        {/* The account's own settings, last, where someone looking for them goes. */}
        <Link className="admin-link-row" href="/account/password">
          <span className="admin-account-icon"><KeyRound size={18} /></span>
          <span>
            <b>{t('પાસવર્ડ બદલો', 'Change password')}</b>
            <small>{t('હાલનો પાસવર્ડ લખીને નવો રાખો', 'Enter the current one, then choose a new one')}</small>
          </span>
          <ChevronRight size={19} />
        </Link>

        <SignOutButton lang={lang} />
      </section>
    </AppShell>
  );
}

function GroupHead({ icon, title, note }: { icon: React.ReactNode; title: string; note: string }) {
  return (
    <div className="member-group-head">
      <span>{icon}</span>
      <div>
        <h3>{title}</h3>
        <small>{note}</small>
      </div>
    </div>
  );
}

/** Where a candidate stands, in the same order `nextStep` on Home walks. */
function candidateStatus(candidate: CandidateSummary, t: T): { label: string; tone: string } {
  if (candidate.discoverable) return { label: t('પ્રકાશિત', 'Live'), tone: 'ok' };
  if (candidate.paused) return { label: t('થોભાવેલી', 'Paused'), tone: 'warn' };
  if (candidate.identity_status !== 'verified') return { label: t('ચકાસણી બાકી', 'Being verified'), tone: 'gold' };
  if (candidate.biodata?.status === 'correction_requested') return { label: t('સુધારો જરૂરી', 'Needs a fix'), tone: 'warn' };
  if (candidate.biodata?.status === 'submitted' || candidate.biodata?.status === 'under_review') return { label: t('મંજૂરીની રાહ', 'Awaiting approval'), tone: 'gold' };
  return { label: t('બાયોડેટા બાકી', 'Biodata to do'), tone: 'rose' };
}
