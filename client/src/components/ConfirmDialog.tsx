import { useState, type ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Modal } from './ui';

/** Destructive-action confirmation, replacing window.confirm(). */
export default function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', icon, tone = 'danger', onConfirm, onClose }: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  icon?: ReactNode;
  tone?: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={busy ? () => {} : onClose} className="modal narrow" labelledBy="confirm-title">
      <div className={tone === 'danger' ? 'icon-chip danger' : 'icon-chip lg'}>{icon || <Trash2 size={20} />}</div>
      <h2 className="modal-title" id="confirm-title">{title}</h2>
      <div className="modal-body-text">{body}</div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{cancelLabel}</button>
        <button type="button" className={tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'} onClick={confirm} disabled={busy} autoFocus>
          {busy && <Loader2 size={16} className="spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
