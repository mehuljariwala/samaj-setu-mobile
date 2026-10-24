'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * The address banner again, as a sheet over the home screen, for an approved
 * biodata without the full address (migration 20261024000200). Drawn like the
 * rules sheet, the one other sheet families know. It opens once per visit, so
 * coming back to home does not bring it up each time; the banner under the top
 * bar stays until the address is saved.
 */
export function AddressPopup({
  lang,
  candidateId,
  name,
  self,
}: {
  lang: Lang;
  candidateId: string;
  name: string;
  self: boolean;
}) {
  const t = translator(lang);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const key = `address-popup:${candidateId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage refused (a private window): show it, just not only once.
    }
    dialog.current?.showModal();
  }, [candidateId]);

  const close = () => dialog.current?.close();

  return (
    <dialog
      ref={dialog}
      className="address-popup"
      aria-labelledby="address-popup-title"
    >
      <div className="address-popup-head">
        <span className="address-popup-badge"><MapPin size={22} /></span>
        <div>
          <h2 id="address-popup-title">{t('પૂરું સરનામું ઉમેરો', 'Add the full address')}</h2>
          <p>
            {self
              ? t('તમારા બાયોડેટામાં હાલનું સરનામું બાકી છે', 'Your biodata is missing the current address')
              : t(`${name}ના બાયોડેટામાં હાલનું સરનામું બાકી છે`, `${name}’s biodata is missing the current address`)}
          </p>
        </div>
      </div>
      <p className="address-popup-text">
        {t(
          'એક મિનિટનું કામ છે, અને એડમિનની મંજૂરી જોઈતી નથી. સરનામું ફક્ત એડમિન જુએ છે, બીજા પરિવારો નહીં.',
          'It takes a minute and needs no admin approval. Only an admin sees the address, not other families.',
        )}
      </p>
      <div className="address-popup-foot">
        <Link className="cta" href={`/biodata/address?candidate=${candidateId}`}>
          {t('હમણાં ઉમેરો', 'Add it now')}<ArrowRight size={20} />
        </Link>
        <button type="button" className="bio-later" onClick={close}>{t('પછીથી', 'Later')}</button>
      </div>
    </dialog>
  );
}
