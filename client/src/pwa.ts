// Service worker for the cloud web app: caches the app itself so it opens offline (data comes
// from the device's local copy). Not used by the desktop app.

/** Fired when a new version has been downloaded and is waiting for a reload. */
export const UPDATE_READY_EVENT = 'lexledger:update-ready';

let registered = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function registerServiceWorker() {
  if (registered || !import.meta.env.PROD || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  registered = true;
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      updateServiceWorker = registerSW({
        // Register now: this runs after sign-in, long after the page's load event
        immediate: true,
        onNeedRefresh: () => window.dispatchEvent(new Event(UPDATE_READY_EVENT)),
      });
    })
    .catch((err) => console.warn('Service worker registration failed:', err));
}

/** Switch to the waiting version and reload. */
export function applyUpdate() {
  void updateServiceWorker?.(true);
}
