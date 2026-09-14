'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CircleHelp, Images, RefreshCw, X } from 'lucide-react';

import type { Lang } from '@/lib/i18n';
import { translator } from '@/lib/i18n';

type Stage = 'idle' | 'requesting' | 'live' | 'captured' | 'denied' | 'unsupported';

type Props = {
  lang: Lang;
  /** Rear camera for documents, front for portraits. */
  facing?: 'environment' | 'user';
  /** Longest edge of the captured image. Documents need to stay legible. */
  maxEdge?: number;
  label: string;
  onCapture: (file: File) => void;
  onCancel?: () => void;
};

/**
 * In-app camera capture.
 *
 * Beyond convenience, this matters for a birth certificate: a photo taken here
 * never reaches the phone's gallery, which is where the native camera app would
 * put it. The frame goes from the video stream straight to a canvas, to a JPEG,
 * to the private bucket.
 *
 * `<input capture>` would be less code but hands off to the OS camera app,
 * which saves to the gallery and gives no retake without leaving the form.
 * Both paths exist: this component for the camera, and the caller's own file
 * input for a PDF or an existing photo.
 *
 * Requires a secure context — https, or localhost in development.
 */
export function DocumentCapture({
  lang,
  facing = 'environment',
  maxEdge = 2000,
  label,
  onCapture,
  onCancel,
}: Props) {
  const t = translator(lang);

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<File | null>(null);

  /**
   * Releasing the camera is not optional housekeeping — leave the tracks
   * running and the phone keeps its camera indicator lit after the user has
   * moved on, which is alarming and fair enough.
   */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // Revoke the object URL when the preview changes or the component goes away.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function requestCamera() {
    setError('');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStage('unsupported');
      return;
    }

    setStage('requesting');

    try {
      // Asking for an ideal size rather than a fixed one: a constraint the
      // device cannot meet would fail outright instead of degrading.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });

      streamRef.current = stream;
      setStage('live');

      // The element only exists once `live` has rendered.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => { /* autoplay blocked; the poster still shows */ });
        }
      });
    } catch (caught) {
      stopCamera();
      const name = caught instanceof DOMException ? caught.name : '';

      // Each of these needs a different next step, so they get different words.
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStage('denied');
        setError(t(
          'કૅમેરાની પરવાનગી મળી નથી. બ્રાઉઝરના સરનામાં પટ્ટીમાંના તાળાના ચિહ્ન પરથી પરવાનગી આપી શકો છો — અથવા નીચેથી ફાઇલ પસંદ કરો.',
          'Camera permission was not given. You can allow it from the lock icon in your browser’s address bar — or choose a file below instead.',
        ));
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setStage('unsupported');
        setError(t(
          'આ ઉપકરણ પર કૅમેરા મળ્યો નથી. કૃપા કરીને ફાઇલ પસંદ કરો.',
          'No camera was found on this device. Please choose a file instead.',
        ));
      } else if (name === 'NotReadableError') {
        setStage('denied');
        setError(t(
          'કૅમેરા બીજી કોઈ ઍપ વાપરી રહી છે. તે બંધ કરીને ફરી પ્રયાસ કરો.',
          'Another app is using the camera. Close it and try again.',
        ));
      } else {
        setStage('denied');
        setError(t('કૅમેરા ખોલી શકાયો નથી.', 'The camera could not be opened.'));
      }
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Scale the longest edge down to maxEdge. A full-resolution phone photo is
    // several megabytes; a certificate stays readable well below that, and the
    // upload has to work on a poor connection.
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError(t('ચિત્ર લઈ શકાયું નથી.', 'The photo could not be taken.'));
          return;
        }
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
        fileRef.current = file;
        setPreview(URL.createObjectURL(blob));
        setStage('captured');
        // Released as soon as there is a frame to keep — the preview is a
        // still, so the camera has no reason to stay open.
        stopCamera();
      },
      'image/jpeg',
      0.85,
    );
  }

  function retake() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview('');
    fileRef.current = null;
    void requestCamera();
  }

  function use() {
    if (fileRef.current) onCapture(fileRef.current);
    if (preview) URL.revokeObjectURL(preview);
    setPreview('');
    fileRef.current = null;
    setStage('idle');
  }

  function close() {
    stopCamera();
    if (preview) URL.revokeObjectURL(preview);
    setPreview('');
    fileRef.current = null;
    setStage('idle');
    setError('');
    onCancel?.();
  }

  /* ------------------------------------------------------------- render -- */

  if (stage === 'idle' || stage === 'requesting') {
    return (
      <>
        <button type="button" className="capture-open" onClick={() => void requestCamera()} disabled={stage === 'requesting'}>
          <Camera size={18} />
          {stage === 'requesting'
            ? t('કૅમેરાની પરવાનગી માંગી રહ્યા છીએ…', 'Asking for camera permission…')
            : label}
        </button>
        {stage === 'requesting' && (
          <p className="field-hint">
            {t(
              'બ્રાઉઝર પરવાનગી માંગશે. “મંજૂરી આપો” પસંદ કરો.',
              'Your browser will ask for permission. Choose “Allow”.',
            )}
          </p>
        )}
      </>
    );
  }

  if (stage === 'denied' || stage === 'unsupported') {
    return (
      <>
        <div className="note">
          <CircleHelp size={19} />
          <p>{error}</p>
        </div>
        {stage === 'denied' && (
          <button type="button" className="capture-open" onClick={() => void requestCamera()}>
            <RefreshCw size={17} />
            {t('ફરી પ્રયાસ કરો', 'Try again')}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="capture">
      <div className="capture-stage">
        {stage === 'live' ? (
          // playsInline is what stops iOS Safari taking the video fullscreen.
          <video ref={videoRef} playsInline muted autoPlay aria-label={t('કૅમેરા', 'Camera')} />
        ) : (
          // oxlint-disable-next-line nextjs/no-img-element
          <img src={preview} alt={t('લીધેલું ચિત્ર', 'The photo you took')} />
        )}

        <button
          type="button"
          className="capture-close"
          aria-label={t('કૅમેરા બંધ કરો', 'Close the camera')}
          onClick={close}
        >
          <X size={18} />
        </button>

        {stage === 'live' && (
          // A frame to aim at. Documents photographed edge-to-edge are the
          // ones an admin ends up asking to have retaken.
          <span className="capture-frame" aria-hidden="true" />
        )}
      </div>

      {stage === 'live' ? (
        <>
          <p className="capture-hint">
            {t(
              'આખું પાનું ચોકઠામાં આવે અને અક્ષરો સ્પષ્ટ વંચાય તેમ રાખો.',
              'Fit the whole page inside the frame and check the text is readable.',
            )}
          </p>
          <button type="button" className="primary" onClick={capture}>
            <Camera size={19} />
            {t('ચિત્ર લો', 'Take the photo')}
          </button>
        </>
      ) : (
        <>
          <p className="capture-hint">
            {t(
              'અક્ષરો સ્પષ્ટ વંચાય છે? ન વંચાય તો ફરી લો.',
              'Is the text clearly readable? Retake it if not.',
            )}
          </p>
          <div className="capture-actions">
            <button type="button" className="secondary" onClick={retake}>
              <RefreshCw size={17} />
              {t('ફરી લો', 'Retake')}
            </button>
            <button type="button" className="primary" onClick={use}>
              <Images size={17} />
              {t('આ વાપરો', 'Use this photo')}
            </button>
          </div>
        </>
      )}

      {error && <p role="alert" className="error"><CircleHelp size={17} />{error}</p>}
    </div>
  );
}
