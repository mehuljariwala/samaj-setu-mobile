import { Sprout } from 'lucide-react';

/**
 * Shown the instant a link or button is tapped, while the next screen's data
 * comes from the server. Every page is rendered on demand, so without this the
 * old screen sat unchanged for a second or more and taps felt ignored.
 *
 * It is prefetched with each link, so it has to be static: no cookies, no
 * language, no text — just the shape of a screen and a moving line.
 */
export default function Loading() {
  return (
    <div className="app-frame">
      <div className="app" aria-busy="true">
        <header className="topbar">
          <div className="topbar-brand"><Sprout size={22} strokeWidth={1.8} /></div>
          <span className="skel skel-pill" />
        </header>
        <div className="screen route-loading">
          <span className="route-loading-bar" aria-hidden="true" />
          <div className="skel skel-hero" />
          <span className="skel skel-line wide" />
          <span className="skel skel-line" />
          <div className="skel skel-card" />
          <div className="skel skel-card" />
          <div className="skel skel-card short" />
        </div>
      </div>
    </div>
  );
}
