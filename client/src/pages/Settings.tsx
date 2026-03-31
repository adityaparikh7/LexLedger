import { useState, useEffect, useContext } from 'react';
import { getFirmProfile, updateFirmProfile, type FirmProfile } from '../api';
import { ToastContext } from '../context/ToastContext';
import { Hand, Landmark, Building, PenTool, Mail, Lightbulb, FileText, Info, Save, Loader2 } from 'lucide-react';

const EMPTY_PROFILE: FirmProfile = {
  firm_name: '',
  firm_address: '',
  firm_phone: '',
  firm_email: '',
  bank_account_name: '',
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  pan_number: '',
  signature_name: '',
  signature_full: '',
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_pass: '',
};

export default function Settings() {
  const { addToast } = useContext(ToastContext);
  const [profile, setProfile] = useState<FirmProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [savedProfile, setSavedProfile] = useState<FirmProfile>(EMPTY_PROFILE);

  useEffect(() => {
    getFirmProfile()
      .then((data) => {
        setProfile(data);
        setSavedProfile(data);
      })
      .catch((err) => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const changed = JSON.stringify(profile) !== JSON.stringify(savedProfile);
    setHasChanges(changed);
  }, [profile, savedProfile]);

  const handleChange = (field: keyof FirmProfile, value: string | number) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateFirmProfile(profile);
      setProfile(updated);
      setSavedProfile(updated);
      addToast('Firm profile saved successfully', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const isProfileEmpty = !profile.firm_name && !profile.firm_address && !profile.firm_email;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your billing preferences and firm details</p>
        </div>
        <div className="btn-group">
          {hasChanges && (
            <button className="btn btn-outline" onClick={() => { setProfile(savedProfile); }}>
              Discard
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{ opacity: saving || !hasChanges ? 0.5 : 1 }}
          >
            {saving ? <><Loader2 size={16} className="spinner" style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', width: 16, height: 16 }} /> Saving…</> : <><Save size={16} /> Save Profile</>}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <>
          {/* Setup prompt for first-time users */}
          {isProfileEmpty && (
            <div className="card" style={{ marginBottom: 24, borderColor: 'var(--accent-green)', borderWidth: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Hand size={28} color="var(--accent-green)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-heading)' }}>Welcome! Set up your firm profile</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Fill in your details below. This information will appear on all your invoices, memos, and exports.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Firm Identity */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Landmark size={20} /> Firm Identity</h3>
              <div style={{ display: 'grid', gap: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Firm / Advocate Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Advocate John Doe"
                    value={profile.firm_name}
                    onChange={(e) => handleChange('firm_name', e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Address</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 123 Law Street, Suite 100, Mumbai - 400 001"
                    value={profile.firm_address}
                    onChange={(e) => handleChange('firm_address', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Phone</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. +91 98201 22460"
                      value={profile.firm_phone}
                      onChange={(e) => handleChange('firm_phone', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="e.g. advocate@firm.com"
                      value={profile.firm_email}
                      onChange={(e) => handleChange('firm_email', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Building size={20} /> Bank Details</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, marginTop: -8 }}>
                Displayed on invoice memos for payment instructions.
              </p>
              <div style={{ display: 'grid', gap: 16 }}>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Account Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. John Doe"
                      value={profile.bank_account_name}
                      onChange={(e) => handleChange('bank_account_name', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bank Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. ICICI Bank, Prabhadevi Branch, Mumbai"
                      value={profile.bank_name}
                      onChange={(e) => handleChange('bank_name', e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Account Number</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 005701061521"
                      value={profile.bank_account_number}
                      onChange={(e) => handleChange('bank_account_number', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">IFSC Code</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. ICIC0000057"
                      value={profile.bank_ifsc}
                      onChange={(e) => handleChange('bank_ifsc', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">PAN Number</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. ABCDE 1234F"
                      value={profile.pan_number}
                      onChange={(e) => handleChange('pan_number', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><PenTool size={20} /> Signature</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, marginTop: -8 }}>
                Appears at the bottom of your invoice memos.
              </p>
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Signature Name (Short)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. JDoe"
                    value={profile.signature_name}
                    onChange={(e) => handleChange('signature_name', e.target.value)}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Rendered in cursive script on the memo
                  </span>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Full Name & Title</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. John H. Doe, Advocate"
                    value={profile.signature_full}
                    onChange={(e) => handleChange('signature_full', e.target.value)}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Printed below the signature
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Email Configuration */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={20} /> Email Configuration</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, marginTop: -8 }}>
                Configure your SMTP settings to send invoices and reminders via email.
              </p>
              <div style={{ display: 'grid', gap: 16 }}>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">SMTP Host</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. smtp.gmail.com"
                      value={profile.smtp_host}
                      onChange={(e) => handleChange('smtp_host', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">SMTP Port</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g. 587"
                      value={profile.smtp_port}
                      onChange={(e) => handleChange('smtp_port', parseInt(e.target.value, 10) || 587)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">SMTP Username (Email)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. your-email@gmail.com"
                      value={profile.smtp_user}
                      onChange={(e) => handleChange('smtp_user', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">SMTP Password (App Password)</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="e.g. abcdefghijklmnop"
                      value={profile.smtp_pass}
                      onChange={(e) => handleChange('smtp_pass', e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 12 }}>
                <Lightbulb size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} /> If no SMTP is configured, emails are sent to <a href="https://ethereal.email" target="_blank" rel="noopener" style={{ color: 'var(--accent-blue)' }}>Ethereal</a> test accounts for preview.
              </p>
            </div>
          </div>

          {/* Invoice Settings */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={20} /> Invoice Settings</h3>
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--bg-glass)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Invoice Number Format</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Auto-generated as SEQ/YYYY-YY (financial year)</div>
                  </div>
                  <span className="badge sent">AUTO</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--bg-glass)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Redundant Copies</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Every PDF & Excel export is saved in the copies/ directory</div>
                  </div>
                  <span className="badge paid">ENABLED</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: 'var(--bg-glass)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Date Auto-Population</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>New invoices default to today's date (editable)</div>
                  </div>
                  <span className="badge paid">ENABLED</span>
                </div>
              </div>
            </div>
          </div>

          {/* About */}
          <div className="card">
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Info size={20} /> About</h3>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
                <p><strong>LexLedger</strong> v1.2.0</p>
                <p>A professional invoicing and billing tool designed for legal practices.</p>
                <div style={{ marginTop: 12 }}>
                  <strong>Key Features:</strong>
                  <ul style={{ paddingLeft: 20, margin: 0 }}>
                    <li><strong>Standalone Desktop App:</strong> Native experience for macOS & Windows.</li>
                    <li><strong>Flexible Invoicing:</strong> Generate professional PDF invoices with auto-numbering.</li>
                    <li><strong>Payment Management:</strong> Advanced tracking for partial payments & TDS.</li>
                    <li><strong>Bulk Export:</strong> Export invoice records to Excel for custom date ranges.</li>
                    <li><strong>Customization:</strong> Fully editable firm profiles and integrated SMTP email.</li>
                    <li><strong>Reliability:</strong> Offline access with automated redundant backups.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
