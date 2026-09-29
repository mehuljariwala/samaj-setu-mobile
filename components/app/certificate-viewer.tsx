'use client';

import { useState, useTransition } from 'react';
import { CircleHelp, Eye, FileText, IdCard } from 'lucide-react';

import { certificateUrlAction, documentUrlAction } from '@/app/actions/admin';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * Spec §10: "private certificate inspection", and never in a queue thumbnail.
 *
 * The URL is fetched on demand, not rendered into the page, so a certificate is
 * only ever retrieved by an admin who asked for it. The RPC records the access
 * before it returns the path, and the signed URL lasts two minutes.
 *
 * The same row opens either side of the photo ID when `kind` says so; those
 * go through their own audited RPC.
 */
export function CertificateViewer({
  lang,
  applicationId,
  meta,
  kind = 'birth_certificate',
  title,
  hint = true,
}: {
  lang: Lang;
  applicationId: string;
  meta: { mime_type?: string; size_bytes?: number; uploaded_at?: string } | null;
  kind?: 'birth_certificate' | 'identity_front' | 'identity_back';
  title?: string;
  /** The "opening is recorded" line; shown once under a group of documents. */
  hint?: boolean;
}) {
  const t = translator(lang);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  if (!meta) {
    return (
      <div className="note">
        <CircleHelp size={19} />
        <p>
          {kind === 'birth_certificate'
            ? t('આ અરજી પર પ્રમાણપત્ર નથી.', 'No certificate is attached to this application.')
            : t(`${title ?? 'ઓળખપત્ર'} જોડાયેલ નથી.`, `${title ?? 'The ID'} is not attached.`)}
        </p>
      </div>
    );
  }

  return (
    <>
      <button
        className="doc-row"
        disabled={pending}
        onClick={() => start(async () => {
          const result = kind === 'birth_certificate'
            ? await certificateUrlAction(applicationId)
            : await documentUrlAction(applicationId, kind);
          if (result.ok && result.data.url) window.open(result.data.url, '_blank', 'noopener');
          else setError(result.ok ? t('ફાઇલ મળી નથી.', 'The file could not be found.') : result.message);
        })}
      >
        <span>{kind === 'birth_certificate' ? <FileText size={21} /> : <IdCard size={21} />}</span>
        <span>
          <b>{title ?? t('જન્મ પ્રમાણપત્ર', 'Birth certificate')}</b>
          <small>
            {meta.mime_type}
            {meta.size_bytes ? ` · ${Math.round(meta.size_bytes / 1024)} KB` : ''}
          </small>
        </span>
        <Eye size={19} />
      </button>
      {hint && <p className="field-hint">
        {t(
          'ખોલવાનું નોંધાય છે. લિંક બે મિનિટમાં સમાપ્ત થાય છે. દસ્તાવેજ શેર કરશો નહીં.',
          'Opening this is recorded. The link expires in two minutes. Never share the document.',
        )}
      </p>}
      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
    </>
  );
}
