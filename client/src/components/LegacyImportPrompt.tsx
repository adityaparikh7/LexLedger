import { useEffect, useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { importDesktopDatabase } from '../api';
import { useSession } from '../auth/SessionContext';
import { useToast } from '../context/ToastContext';
import { db } from '../local/db';
import { syncNow } from '../local/sync';

// Remembered per account, so declining (or importing) isn't asked again
const answeredKey = (accountId: string) => `lexledger:legacy-import:${accountId}`;

function wasAnswered(accountId: string): boolean {
  try {
    return localStorage.getItem(answeredKey(accountId)) !== null;
  } catch {
    return false;
  }
}

function remember(accountId: string, answer: 'imported' | 'declined') {
  try {
    localStorage.setItem(answeredKey(accountId), answer);
  } catch {
    // Storage unavailable: the prompt may show again next time
  }
}

interface Found {
  source: 'database' | 'backup';
  modifiedAt: string;
  size: number;
}

/** In the desktop app: offers to copy the data from earlier (offline-only) versions into a new,
 *  empty cloud account. */
export default function LegacyImportPrompt() {
  const { mode, user } = useSession();
  const { addToast } = useToast();
  const [found, setFound] = useState<Found | null>(null);
  const [importing, setImporting] = useState(false);
  const accountId = user?.account.id;

  useEffect(() => {
    const api = window.electronAPI;
    if (mode !== 'cloud' || !accountId || !api?.findLegacyData || wasAnswered(accountId)) return;
    let cancelled = false;
    (async () => {
      const legacy = await api.findLegacyData!();
      // Only into an empty account: the server refuses to import over existing data
      const empty = (await db.clients.count()) === 0 && (await db.invoices.count()) === 0;
      if (!cancelled && legacy && empty) setFound(legacy);
    })().catch((err) => console.warn('Checking for desktop data failed:', err));
    return () => {
      cancelled = true;
    };
  }, [mode, accountId]);

  if (!found || !accountId) return null;

  const decline = () => {
    remember(accountId, 'declined');
    setFound(null);
  };

  const runImport = async () => {
    setImporting(true);
    try {
      const bytes = await window.electronAPI!.readLegacyData!();
      if (!bytes) throw new Error("Couldn't read the data from the earlier version");
      const result = await importDesktopDatabase(new Blob([bytes as Uint8Array<ArrayBuffer>]));
      remember(accountId, 'imported');
      setFound(null);
      addToast(`Imported ${result.clients} clients and ${result.invoices} fee memos`, 'success');
      await syncNow();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const when = new Date(found.modifiedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-labelledby="legacy-import-title">
        <div className="modal-header">
          <h3 className="modal-title" id="legacy-import-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatabaseBackup size={20} /> Bring over your existing data?
          </h3>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
          This computer has LexLedger data from the earlier desktop version
          {found.source === 'backup' ? ` (its latest backup, ${when})` : ` (last changed ${when})`}.
          Import your clients, fee memos, payments and firm details into this account so they're on all your devices.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
          The original file stays on this computer. You can also import later from Settings → Account.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={decline} disabled={importing}>Not now</button>
          <button type="button" className="btn btn-primary" onClick={runImport} disabled={importing}>
            {importing ? 'Importing…' : 'Import my data'}
          </button>
        </div>
      </div>
    </div>
  );
}
