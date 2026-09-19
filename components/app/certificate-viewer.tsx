'use client';

import { useState, useTransition } from 'react';
import { CircleHelp, Eye, FileText } from 'lucide-react';

import { certificateUrlAction } from '@/app/actions/admin';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * Spec §10: "private certificate inspection", and never in a queue thumbnail.
 *
 * The URL is fetched on demand, not rendered into the page, so a certificate is
 * only ever retrieved by an admin who asked for it. The RPC records the access
 * before it returns the path, and the signed URL lasts two minutes.
 */
export function CertificateViewer({
  lang,
  applicationId,
  meta,
}: {
  lang: Lang;
  applicationId: string;
  meta: { mime_type?: string; size_bytes?: number; uploaded_at?: string } | null;
}) {
  const t = translator(lang);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  if (!meta) {
    return (
      <div className="note">
        <CircleHelp size={19} />
        <p>{t('આ અરજી પર પ્રમાણપત્ર નથી.', 'No certificate is attached to this application.')}</p>
      </div>
    );
  }

  return (
    <>
      <button
        className="doc-row"
        disabled={pending}
        onClick={() => start(async () => {
          const result = await certificateUrlAction(applicationId);
          if (result.ok && result.data.url) window.open(result.data.url, '_blank', 'noopener');
          else setError(result.ok ? t('ફાઇલ મળી નથી.', 'The file could not be found.') : result.message);
        })}
      >
        <span><FileText size={21} /></span>
        <span>
          <b>{t('જન્મ પ્રમાણપત્ર', 'Birth certificate')}</b>
          <small>
            {meta.mime_type}
            {meta.size_bytes ? ` · ${Math.round(meta.size_bytes / 1024)} KB` : ''}
          </small>
        </span>
        <Eye size={19} />
      </button>
      <p className="field-hint">
        {t(
          'ખોલવાનું નોંધાય છે. લિંક બે મિનિટમાં સમાપ્ત થાય છે. દસ્તાવેજ શેર કરશો નહીં.',
          'Opening this is recorded. The link expires in two minutes. Never share the document.',
        )}
      </p>
      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
    </>
  );
}
