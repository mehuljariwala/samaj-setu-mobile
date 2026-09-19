'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleHelp, FileText, ImagePlus, Trash2 } from 'lucide-react';

import { DocumentCapture } from '@/components/app/document-capture';
import { registerMediaAction, removeMediaAction } from '@/app/actions/matching';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  BUCKETS, MAX_PHOTO_BYTES, MAX_UPLOAD_BYTES, PHOTO_TYPES, objectPath,
} from '@/lib/storage';
import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

export type UploadedMedia = {
  id: string;
  url: string | null;
  status: string;
  is_primary: boolean;
};

/**
 * Photographs and janmakshar go straight from the browser to a private bucket,
 * then a second call records the row. Two steps because an interrupted transfer
 * must not leave a profile that looks like it has a photograph, and because a
 * 4 MB image has no business travelling through the Next.js server.
 *
 * Nothing here is public: the bucket is private, and the images shown are
 * short-lived signed URLs minted only after the database has authorised the
 * viewer.
 */
export function MediaUploader({
  lang,
  candidateId,
  kind,
  existing,
}: {
  lang: Lang;
  candidateId: string;
  kind: 'photo' | 'kundali';
  existing: UploadedMedia[];
}) {
  const t = translator(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const isPhoto = kind === 'photo';
  const limit = isPhoto ? MAX_PHOTO_BYTES : MAX_UPLOAD_BYTES;
  const accept = isPhoto ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf';

  function upload(file: File) {
    setError('');

    if (isPhoto && !PHOTO_TYPES.includes(file.type)) {
      setError(t('ફક્ત JPG, PNG કે WebP ફોટો.', 'Only a JPG, PNG or WebP image.'));
      return;
    }
    if (file.size > limit) {
      setError(t(
        `ફાઇલ ${Math.round(limit / 1048576)} MB કરતાં નાની હોવી જોઈએ.`,
        `The file must be under ${Math.round(limit / 1048576)} MB.`,
      ));
      return;
    }

    start(async () => {
      const path = objectPath(candidateId, file.name);
      const bucket = isPhoto ? BUCKETS.photo : BUCKETS.kundali;

      const { error: uploadError } = await getSupabaseBrowserClient()
        .storage.from(bucket)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(t('અપલોડ થઈ શક્યું નથી. ફરી પ્રયાસ કરો.', 'The upload failed. Please try again.'));
        return;
      }

      const registered = await registerMediaAction({
        candidateId,
        kind,
        storagePath: path,
        mimeType: file.type,
        sizeBytes: file.size,
        isPrimary: isPhoto && existing.length === 0,
      });

      if (!registered.ok) setError(registered.message);
      else router.refresh();
    });
  }

  return (
    <>
      {existing.length > 0 && (
        <div className="photo-strip">
          {existing.map((item) => (
            item.url && isPhoto
              // Plain <img> on purpose: these are short-lived signed URLs for
              // private objects. next/image would cache an optimised copy at a
              // stable, unsigned address that outlives the grant.
              // oxlint-disable-next-line nextjs/no-img-element
              ? <img key={item.id} src={item.url} alt="" />
              : (
                <div className="card row-card flush" key={item.id}>
                  <FileText size={18} />
                  <small>{item.status === 'approved' ? t('મંજૂર', 'Approved') : t('સમીક્ષા બાકી', 'In review')}</small>
                </div>
              )
          ))}
        </div>
      )}

      <div className="compact-media">
        <label className={existing.length > 0 ? 'on' : ''}>
          {isPhoto ? <ImagePlus size={18} /> : <FileText size={18} />}
          {pending
            ? t('અપલોડ થઈ રહ્યું છે…', 'Uploading…')
            : isPhoto
              ? t('ફોટો ઉમેરો', 'Add a photograph')
              : t('જન્માક્ષર ઉમેરો', 'Add the janmakshar')}
          {existing.length > 0 && <Check size={14} />}
          <input
            type="file"
            accept={accept}
            hidden
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
              event.target.value = '';
            }}
          />
        </label>

        {existing.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => {
              await removeMediaAction(existing[existing.length - 1].id);
              router.refresh();
            })}
          >
            <Trash2 size={16} />
            {t('છેલ્લું દૂર કરો', 'Remove the last one')}
          </button>
        )}
      </div>

      {/* A portrait wants the front camera and does not need document
          resolution; a janmakshar is a document and does. */}
      <DocumentCapture
        lang={lang}
        facing={isPhoto ? 'user' : 'environment'}
        maxEdge={isPhoto ? 1600 : 2000}
        label={isPhoto
          ? t('કૅમેરાથી ફોટો લો', 'Take a photo with the camera')
          : t('કૅમેરાથી જન્માક્ષરનો ફોટો લો', 'Photograph the janmakshar')}
        onCapture={upload}
      />

      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}

      <p className="compact-help">
        {existing.some((item) => item.status === 'pending_review')
          ? t(
            'નવાં ચિત્રો એડમિન સમીક્ષા પછી જ બીજાને દેખાશે.',
            'New images are shown to others only after an admin has reviewed them.',
          )
          : t(
            'ચિત્રો ખાનગી બકેટમાં રહે છે અને તમારી મંજૂરી પછી જ દેખાય છે.',
            'Images stay in a private bucket and are shown only to viewers you approve.',
          )}
      </p>
    </>
  );
}
