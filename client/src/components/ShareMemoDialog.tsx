import { useState } from 'react';
import { Mail, Share2, X } from 'lucide-react';
import { saveBlob, type ComposeRequest } from '../api';
import { openCompose, shareFile } from '../share';
import { useToast } from '../context/ToastContext';

/** Phone flow for sending a fee memo: the PDF is ready, and tapping Share opens the system share
 *  sheet with it attached. (The share sheet needs a fresh tap, so it can't open by itself after
 *  the PDF downloads.) */
export default function ShareMemoDialog({ file, compose, onClose }: { file: File; compose: ComposeRequest; onClose: () => void }) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  const sendWithMailApp = () => {
    openCompose(compose);
    saveBlob(file, file.name);
    addToast('Mail app opened — the PDF is downloading. Please attach it to the email.', 'info');
    onClose();
  };

  const share = async () => {
    setBusy(true);
    try {
      if (await shareFile(file, compose.subject, compose.body)) {
        addToast('Fee memo shared', 'success');
        onClose();
      }
    } catch {
      sendWithMailApp();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-labelledby="share-memo-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" id="share-memo-title">Send fee memo</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>
          To <strong>{compose.to}</strong>
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, overflowWrap: 'anywhere' }}>{file.name}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button type="button" className="btn btn-primary" onClick={share} disabled={busy}>
            <Share2 size={16} /> Share PDF…
          </button>
          <button type="button" className="btn btn-outline" onClick={sendWithMailApp} disabled={busy}>
            <Mail size={16} /> Use my email app instead
          </button>
        </div>
      </div>
    </div>
  );
}
