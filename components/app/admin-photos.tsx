import { Camera } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

/**
 * The profile's photos on an approval page, so the admin can see the face
 * next to the photo ID before deciding. They are approved together with the
 * profile (20261004000600).
 */
export function AdminPhotos({ lang, photos }: { lang: Lang; photos: { id: string; url: string | null }[] }) {
  const t = translator(lang);
  return (
    <>
      <h2 className="admin-h2">{t('પ્રોફાઇલ ફોટો', 'Profile photo')}</h2>
      {photos.length === 0 ? (
        <p className="admin-alert">
          <Camera size={18} />
          <span>{t('હજી ફોટો નથી. ફોટો વગર અરજી મોકલી શકાતી નથી.', 'No photo yet. An application cannot be sent without one.')}</span>
        </p>
      ) : (
        <div className="admin-photos">
          {photos.map((photo, index) => (
            photo.url
              // Plain <img> on purpose: a signed URL for a private object, nothing to optimise.
              // oxlint-disable-next-line nextjs/no-img-element
              ? <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={t(`ફોટો ${index + 1}`, `Photo ${index + 1}`)} /></a>
              : <span key={photo.id} className="admin-photo-missing"><Camera size={20} /></span>
          ))}
        </div>
      )}
    </>
  );
}
