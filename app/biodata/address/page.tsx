import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app/shell';
import { AddressForm } from '@/components/biodata/address-form';
import { steps } from '@/components/biodata/model';
import { getLiveBiodata } from '@/lib/data/biodata';
import { loadMemberPage } from '@/lib/data/guards';

/**
 * The full address, added to an approved biodata without a new version or an
 * admin's approval (migration 20261024000200). The banner on member screens
 * links here for each child whose live biodata lacks it. A biodata never
 * approved asks the same questions in its own form, so it goes there instead.
 */
export default async function AddressPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, lang, acting } = await loadMemberPage();
  const asked = (await searchParams).candidate;
  const candidate = context.candidates.find((item) => item.id === asked) ?? acting;
  if (!candidate) redirect('/family');

  const live = await getLiveBiodata(candidate.id);
  if (!live) redirect('/biodata');

  const keys = steps.filter((s) => s.id === 'address' || s.id === 'native').flatMap((s) => s.fields.map((f) => f.key));

  return (
    // The header names the child whose address this is, even when another is
    // the one chosen elsewhere.
    <AppShell lang={lang} context={context} acting={candidate} member addressBanner={false}>
      <AddressForm
        lang={lang}
        candidateId={candidate.id}
        name={candidate.full_name}
        self={candidate.is_self}
        initialValues={Object.fromEntries(keys.map((k) => [k, live[k] ?? '']))}
      />
    </AppShell>
  );
}
