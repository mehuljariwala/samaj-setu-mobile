import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app/shell';
import { GuidedBiodata } from '@/components/biodata/guided-form';
import { homeFor, loadApplicantPage } from '@/lib/data/guards';
import { getEditableBiodata } from '@/lib/data/biodata';
import { listOwnMedia } from '@/lib/data/media';
import { getOpenApplication } from '@/lib/data/registration';
import type { Values } from '@/components/biodata/model';

/**
 * The biodata form, for two kinds of family.
 *
 * One still preparing or fixing its registration fills the biodata here
 * before anything is sent, and the form's last screen sends the registration
 * and the biodata together, for the one admin approval. A verified member
 * edits a published biodata here, and an admin approves the new version.
 *
 * While the registration is with an admin the biodata is closed, so that
 * family is shown its status instead of a form the server would refuse.
 */
export default async function BiodataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, lang, acting } = await loadApplicantPage();
  const member = context.access_state === 'approved';
  // Arriving from the registration form: the biodata of the application being
  // prepared, even for a parent already acting for an approved child.
  const applying = (await searchParams).apply === '1';

  let candidateId: string;
  let relationship: string;
  let applicationId: string | null = null;

  if (!applying && member && acting?.identity_status === 'verified') {
    candidateId = acting.id;
    relationship = acting.relationship;
  } else {
    const open = await getOpenApplication();
    // A member's open application must be the candidate they are acting for,
    // or the form would quietly switch child.
    if (!open || (!applying && member && acting && open.candidateId !== acting.id)) {
      redirect(member ? '/review' : homeFor(context));
    }
    candidateId = open.candidateId;
    relationship = open.relationship;
    applicationId = open.applicationId;
  }

  const [{ revision, issues, candidate }, photos, kundali] = await Promise.all([
    getEditableBiodata(candidateId),
    listOwnMedia(candidateId, 'photo'),
    listOwnMedia(candidateId, 'kundali'),
  ]);

  // The candidate's identity details, shown above the form and changed only
  // through the registration — for a verified member, changing them re-opens
  // verification (spec §5).
  const verified = {
    name: candidate.full_name,
    dob: candidate.date_of_birth,
    father: candidate.father_name ?? '',
    city: candidate.city ?? '',
    gender: candidate.gender,
  };

  return (
    // The member chrome (tab bar, "Managing" header) names the acting child,
    // so it stays off while a new registration's biodata is being filled.
    <AppShell lang={lang} context={context} acting={applicationId ? null : acting} member={member && !applicationId}>
      <GuidedBiodata
        lang={lang}
        candidateId={candidateId}
        applicationId={applicationId}
        revisionId={revision?.id ?? null}
        status={revision?.status ?? 'draft'}
        // The server stamps the origin on every save; set here too so the
        // form asks the right questions before the first one.
        initialValues={{ ...(revision?.data ?? {}) as Values, origin: candidate.is_sanatan ? 'sanatan' : 'samaj' }}
        verified={verified}
        relation={relationship}
        decisionReason={revision?.decision_reason ?? null}
        issues={issues.map((issue) => ({
          field_key: issue.field_key,
          message_gu: issue.message_gu,
          message_en: issue.message_en,
        }))}
        photos={photos.map((item) => ({
          id: item.id, url: item.url, status: item.status, is_primary: item.is_primary,
        }))}
        kundali={kundali.map((item) => ({
          id: item.id, url: item.url, status: item.status, is_primary: item.is_primary,
        }))}
      />
    </AppShell>
  );
}
