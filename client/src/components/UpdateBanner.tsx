import { useEffect, useState } from 'react';
import { applyUpdate, UPDATE_READY_EVENT } from '../pwa';

/** Offers to reload when a new version of the web app has been downloaded. */
export default function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onReady = () => setReady(true);
    window.addEventListener(UPDATE_READY_EVENT, onReady);
    return () => window.removeEventListener(UPDATE_READY_EVENT, onReady);
  }, []);
  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of LexLedger is ready.</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={applyUpdate}>Reload</button>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setReady(false)}>Later</button>
    </div>
  );
}
