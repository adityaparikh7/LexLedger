import { useRef, useState } from 'react';
import { Download, LogOut, Upload, UserCircle } from 'lucide-react';
import { importDesktopDatabase } from '../api';
import { downloadAccountExport } from '../data';
import { useSession } from '../auth/SessionContext';
import { useToast } from '../context/ToastContext';

/** Settings card for the cloud version: who is signed in, sign out, and bringing data over
 *  from the desktop app. */
export default function AccountSection() {
  const { user, signOut } = useSession();
  const { addToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadAccountExport();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    if (!confirm(`Import "${file.name}" into this account?\n\nThis copies all clients, fee memos, payments and firm details from the desktop app.`)) return;
    setImporting(true);
    try {
      const result = await importDesktopDatabase(file);
      addToast(`Imported ${result.clients} clients and ${result.invoices} fee memos. Reloading…`, 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="settings-section" style={{ marginBottom: 0 }}>
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><UserCircle size={20} /> Account</h3>
        <div className="account-row">
          <div>
            <div style={{ fontWeight: 600 }}>{user?.user.email}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Signed in on this device. Your data syncs to every device you sign in on.</div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
        <div className="account-row">
          <div>
            <div style={{ fontWeight: 600 }}>Download all your data</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Every client, fee memo, payment and your firm details, as one file for your own records. The server also keeps automatic backups.
            </div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={handleExport} disabled={exporting}>
            <Download size={15} /> {exporting ? 'Preparing…' : 'Download'}
          </button>
        </div>
        <div className="account-row">
          <div>
            <div style={{ fontWeight: 600 }}>Import from the desktop app</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Choose a backup file from the desktop app's Backups folder (lexledger-….db). Works only while this account has no clients or memos.
            </div>
          </div>
          <input ref={fileInput} type="file" accept=".db,.sqlite,application/octet-stream" hidden onChange={(e) => handleImport(e.target.files?.[0])} />
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInput.current?.click()} disabled={importing}>
            <Upload size={15} /> {importing ? 'Importing…' : 'Choose file'}
          </button>
        </div>
      </div>
    </div>
  );
}
