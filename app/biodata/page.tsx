import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app/shell';
import { GuidedBiodata } from '@/components/biodata/guided-form';
import { loadActingPage } from '@/lib/data/guards';
import { getEditableBiodata } from '@/lib/data/biodata';
import { listOwnMedia } from '@/lib/data/media';
import type { Values } from '@/components/biodata/model';

/**
 * Spec §2: biodata completion unlocks on verification approval, so a candidate
 * who is still in review is sent back to their status rather than shown a form
 * the server would refuse to save.
 */
export default async function BiodataPage() {
  const { context, lang, acting } = await loadActingPage();

  if (acting.identity_status !== 'verified') redirect('/review');

  const [{ revision, issues, candidate }, photos, kundali] = await Promise.all([
    getEditableBiodata(acting.id),
    listOwnMedia(acting.id, 'photo'),
    listOwnMedia(acting.id, 'kundali'),
  ]);

  // The candidate's verified identity, shown above the form and unchangeable
  // from it — altering any of it re-opens verification (spec §5).
  const verified = {
    name: candidate.full_name,
    dob: candidate.date_of_birth,
    father: candidate.father_name ?? '',
    city: candidate.city ?? '',
  };

  return (
    <AppShell lang={lang} context={context} acting={acting} member>
      <GuidedBiodata
        lang={lang}
        candidateId={acting.id}
        revisionId={revision?.id ?? null}
        status={revision?.status ?? 'draft'}
        initialValues={(revision?.data ?? {}) as Values}
        verified={verified}
        relation={acting.relationship}
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
