import Link from 'next/link';
import { ChevronRight, MapPin } from 'lucide-react';

import { firstAddressGap } from '@/lib/data/biodata';
import type { MyContext } from '@/lib/data/session';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * Asks an approved family for the full address its live biodata lacks
 * (migration 20261024000200), under the top bar of every member screen until
 * it is there. It says that no approval is needed, since a family that waited
 * for an admin before would otherwise put this off too. With more than one
 * child missing it, the next one shows once the first is saved.
 */
export async function AddressBanner({ lang, context }: { lang: Lang; context: MyContext }) {
  const candidate = await firstAddressGap(context);
  if (!candidate) return null;

  const t = translator(lang);
  return (
    <Link className="address-banner" href={`/biodata/address?candidate=${candidate.id}`}>
      <MapPin size={18} />
      <span>
        <b>
          {candidate.is_self
            ? t('તમારા બાયોડેટામાં પૂરું સરનામું ઉમેરો', 'Add your full address to your biodata')
            : t(`${candidate.full_name}ના બાયોડેટામાં પૂરું સરનામું ઉમેરો`, `Add the full address to ${candidate.full_name}’s biodata`)}
        </b>
        <small>{t('એક મિનિટનું કામ · એડમિનની મંજૂરી જોઈતી નથી', 'Takes a minute · no admin approval needed')}</small>
      </span>
      <ChevronRight size={18} />
    </Link>
  );
}
