import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getSession, logout, UNAUTHORIZED_EVENT, type Session, type SessionUser } from '../api';
import { SessionContext } from './SessionContext';
import Login from './Login';
import { setDataMode } from '../data';
import { hasLocalData, startSync, stopSync } from '../local/sync';
import { clearLocalData, db } from '../local/db';
import { registerServiceWorker } from '../pwa';

// The last signed-in cloud user, so the app can open offline
const SESSION_KEY = 'lexledger:session';

function readCachedUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable (private mode): the app just won't open offline
  }
}

type Phase =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'ready'; session: Session };

/** Shows the sign-in screen when the cloud server needs it; the desktop server needs none.
 *  Once signed in to the cloud, starts syncing the device's copy of the data. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });

  /** Enter the app for a signed-in cloud user. A device that has never synced waits for its
   *  first pull; otherwise the app opens at once from local data and syncs in the background. */
  const enterCloud = useCallback(async (user: SessionUser) => {
    writeCachedUser(user);
    setDataMode('cloud');
    registerServiceWorker();
    const firstTime = !(await hasLocalData());
    if (firstTime) setPhase({ name: 'loading' });
    const sync = startSync(user.account.id);
    if (firstTime) {
      await sync;
      if (!(await hasLocalData())) {
        setPhase({ name: 'error', message: "Couldn't download your data. Check your connection and try again." });
        return;
      }
    }
    setPhase({ name: 'ready', session: { mode: 'cloud', user } });
  }, []);

  const load = useCallback(() => getSession().then(
    async (session) => {
      if (session.mode === 'desktop') {
        setDataMode('desktop');
        setPhase({ name: 'ready', session });
      } else if (session.user) {
        await enterCloud(session.user);
      } else {
        writeCachedUser(null);
        setPhase({ name: 'ready', session });
      }
    },
    async () => {
      // Offline: open with the last signed-in account and its local data
      const cached = readCachedUser();
      if (cached && (await hasLocalData())) return enterCloud(cached);
      setPhase({ name: 'error', message: "Can't reach the LexLedger server. Check your connection and try again." });
    },
  ), [enterCloud]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onUnauthorized = () => {
      stopSync();
      writeCachedUser(null);
      setPhase((p) => (p.name === 'ready' && p.session.mode === 'cloud' ? { name: 'ready', session: { mode: 'cloud', user: null } } : p));
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const signOut = useCallback(async () => {
    const pending = await db.outbox.count();
    if (pending && !confirm(`${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced yet and will be lost if you sign out. Sign out anyway?`)) return;
    stopSync();
    await logout().catch(() => {});
    await clearLocalData();
    writeCachedUser(null);
    setPhase({ name: 'ready', session: { mode: 'cloud', user: null } });
  }, []);

  const retry = () => {
    setPhase({ name: 'loading' });
    load();
  };

  if (phase.name === 'error') {
    return (
      <div className="auth-screen">
        <div className="card auth-card">
          <p style={{ marginBottom: 16 }}>{phase.message}</p>
          <button className="btn btn-primary" onClick={retry}>Try again</button>
        </div>
      </div>
    );
  }
  if (phase.name === 'loading') {
    return (
      <div className="auth-screen">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }
  const { session } = phase;
  if (session.mode === 'cloud' && !session.user) return <Login onSignedIn={enterCloud} />;

  return (
    <SessionContext.Provider value={{ mode: session.mode, user: session.mode === 'cloud' ? session.user : null, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}
