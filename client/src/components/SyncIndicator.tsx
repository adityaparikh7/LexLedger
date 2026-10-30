import { RefreshCw } from 'lucide-react';
import { useSyncState } from '../data';
import { syncNow } from '../local/sync';

/** Sync status for the cloud version; tap to sync now. */
export default function SyncIndicator() {
  const { status, pending, error } = useSyncState();

  const pendingText = pending ? ` · ${pending} to sync` : '';
  const label =
    status === 'syncing' ? 'Syncing…'
    : status === 'offline' ? `Offline${pendingText}`
    : status === 'error' ? 'Sync problem'
    : pending ? `${pending} to sync` : 'Synced';
  const tone = status === 'error' ? 'error' : status === 'offline' || pending ? 'pending' : 'ok';

  return (
    <button
      type="button"
      className={`sync-indicator ${tone}`}
      onClick={() => void syncNow()}
      title={error ?? (status === 'offline' ? 'Changes are saved on this device and will sync when you reconnect' : 'Sync now')}
    >
      {status === 'syncing' ? <RefreshCw size={14} className="sync-spin" /> : <span className="sync-dot" />}
      <span className="sync-label">{label}</span>
    </button>
  );
}
