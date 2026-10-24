import { Languages } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * Families took the address questions to mean the address in Gujarati and
 * again in English. Said at the top of every address screen: once, in either.
 */
export function AddressLanguageNote({ lang }: { lang: Lang }) {
  const t = translator(lang);
  return (
    <p className="member-alert">
      <Languages size={18} />
      <span>
        {t(
          'એક જ વાર લખો — ગુજરાતી કે અંગ્રેજી, જે ફાવે તે ભાષામાં. બંને ભાષામાં લખવાની જરૂર નથી.',
          'Write it once, in Gujarati or English, whichever is easier. There is no need to write it in both.',
        )}
      </span>
    </p>
  );
}
