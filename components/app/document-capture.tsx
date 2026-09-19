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
 * The viewfinder opens in a modal `<dialog>` rather than inline in the form.
 * Framing a document is a whole-attention job, and inline it had to share the
 * screen with the submit button — easy to send an unfinished form by reaching
 * for the shutter. `showModal` also buys the things a hand-rolled overlay has
 * to reimplement: the top layer, a focus trap, an inert background, and
 * Escape.
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<File | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Everything from the permission prompt onwards belongs to the modal.
  const open = stage === 'requesting' || stage === 'live' || stage === 'captured';

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

  // A dialog can only be made modal imperatively, so `open` is mirrored onto
  // the element rather than passed as a prop. `showModal` is what puts it in
  // the top layer; the `open` attribute alone would leave it non-modal.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  /**
   * Attaching the stream as the element mounts, rather than after a frame,
   * because the video only exists on the render that opens the dialog and
   * there is no reliable moment before that to reach for it.
   */
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
    if (!element || !streamRef.current) return;
    element.srcObject = streamRef.current;
    // Autoplay can still be refused; the frame arrives on the first play gesture.
    void element.play().catch(() => { /* ignored */ });
  }, []);

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
      // `attachVideo` picks the stream up as the element mounts.
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

  return (
    <>
      {/* Anything the user has to act on outside the camera stays in the form,
          where the file input it points them at is actually reachable. */}
      {(stage === 'denied' || stage === 'unsupported') && (
        <div className="note">
          <CircleHelp size={19} />
          <p>{error}</p>
        </div>
      )}

      {stage !== 'unsupported' && (
        <button type="button" className="capture-open" onClick={() => void requestCamera()} disabled={open}>
          {stage === 'denied' ? <RefreshCw size={17} /> : <Camera size={18} />}
          {stage === 'denied' ? t('ફરી પ્રયાસ કરો', 'Try again') : label}
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="capture-dialog"
        aria-label={label}
        // Escape fires `cancel`; taking it over keeps the camera-release path
        // down to the single `close`.
        onCancel={(event) => { event.preventDefault(); close(); }}
      >
        <div className="capture-dialog-body">
          <div className="capture-dialog-head">
            <p className="capture-dialog-title">{label}</p>
            <button
              type="button"
              className="capture-close"
              aria-label={t('કૅમેરા બંધ કરો', 'Close the camera')}
              onClick={close}
            >
              <X size={18} />
            </button>
          </div>

          <div className="capture-stage">
            {stage === 'requesting' && (
              <p className="capture-waiting">
                {t(
                  'બ્રાઉઝર પરવાનગી માંગશે. “મંજૂરી આપો” પસંદ કરો.',
                  'Your browser will ask for permission. Choose “Allow”.',
                )}
              </p>
            )}

            {/* playsInline is what stops iOS Safari taking the video fullscreen. */}
            {stage === 'live' && (
              <video ref={attachVideo} playsInline muted autoPlay aria-label={t('કૅમેરા', 'Camera')} />
            )}

            {stage === 'live' && (
              // A frame to aim at. Documents photographed edge-to-edge are the
              // ones an admin ends up asking to have retaken.
              <span className="capture-frame" aria-hidden="true" />
            )}

            {stage === 'captured' && (
              // oxlint-disable-next-line nextjs/no-img-element
              <img src={preview} alt={t('લીધેલું ચિત્ર', 'The photo you took')} />
            )}
          </div>

          <div className="capture-dialog-foot">
            {stage === 'live' && (
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
            )}

            {stage === 'captured' && (
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
        </div>
      </dialog>
    </>
  );
}
