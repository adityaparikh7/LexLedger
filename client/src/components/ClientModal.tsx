import { useState } from 'react';
import { Loader2, Plus, Save, X } from 'lucide-react';
import { createClient, updateClient, type Client } from '../api';
import { useToast } from '../context/ToastContext';
import { Modal } from './ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Add or edit a client. `onSaved` receives the saved client. */
export default function ClientModal({ client, onClose, onSaved }: {
  client?: Client | null;
  onClose: () => void;
  onSaved: (client: Client) => void;
}) {
  const { addToast } = useToast();
  const [name, setName] = useState(client?.name || '');
  const [email, setEmail] = useState(client?.email || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [address, setAddress] = useState(client?.address || '');
  const [emailError, setEmailError] = useState('');
  const [saving, setSaving] = useState(false);

  const validateEmail = (value: string) => {
    const bad = value.trim() !== '' && !EMAIL_RE.test(value.trim());
    setEmailError(bad ? 'Enter a valid email address, like name@example.com' : '');
    return !bad;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return;
    setSaving(true);
    try {
      const data = { name: name.trim(), email: email.trim(), phone: phone.trim(), address: address.trim() };
      const saved = client ? await updateClient(client.id, data) : await createClient(data);
      addToast(client ? 'Client updated' : 'Client added', 'success');
      onSaved(saved);
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="client-modal-title">
      <div className="modal-header">
        <div className="modal-titles">
          <h2 className="modal-title" id="client-modal-title">{client ? 'Edit client' : 'Add client'}</h2>
          <p className="modal-subtitle">Client details appear on the invoice memo</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor="client-name">Name *</label>
          <input id="client-name" className="input" placeholder="Client or company name" value={name}
            onChange={e => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="client-email">Email</label>
          <input id="client-email" type="email" className={`input${emailError ? ' invalid' : ''}`} placeholder="name@example.com"
            value={email} aria-invalid={!!emailError} aria-describedby={emailError ? 'client-email-error' : undefined}
            onChange={e => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value); }}
            onBlur={e => validateEmail(e.target.value)} />
          {emailError && <span className="field-error" id="client-email-error"><X size={16} />{emailError}</span>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="client-phone">Phone</label>
          <input id="client-phone" type="tel" className="input" placeholder="+91 98765 43210" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="client-address">Address</label>
          <textarea id="client-address" className="input" placeholder="Street, city, PIN" value={address}
            onChange={e => setAddress(e.target.value)} rows={2} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={18} className="spin" /> : client ? <Save size={18} /> : <Plus size={18} />}
            {client ? 'Save client' : 'Add client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
