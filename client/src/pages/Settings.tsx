import { useState, useEffect, useContext, useCallback } from 'react';
import {
  getFirmProfile, updateFirmProfile, getBackups, createBackupNow, restoreBackup, chooseBackupFolder,
  type FirmProfile, type BackupInfo, type BackupFile
} from '../api';
import { ToastContext } from '../context/ToastContext';
import { Hand, Landmark, Building, PenTool, Mail, Monitor, Globe, FileText, Info, Save, Loader2, Check, LayoutDashboard, DatabaseBackup, FolderOpen, ArchiveRestore } from 'lucide-react';

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
  email_client: 'mailto',
  backup_enabled: 1,
  backup_dir: '',
  backup_keep: 30,
};

const BACKUP_KEEP_OPTIONS = [7, 14, 30, 60, 90];

/** 2026-10-06T09:30:15 → 06/10/2026, 09:30 */
const formatBackupDate = (createdAt: string) => {
  const [date, time = ''] = createdAt.split('T');
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}, ${time.slice(0, 5)}`;
};

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;


const defaultDashboardPreferences = {
  totalBilled: true,
  totalReceived: true,
  tds: true,
  outstanding: true,
  clients: true,
  totalInvoices: true,
  paid: true,
  unpaid: true,
  sent: true,
  drafts: true
};

export default function Settings() {
  const { addToast } = useContext(ToastContext);
  const [profile, setProfile] = useState<FirmProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [savedProfile, setSavedProfile] = useState<FirmProfile>(EMPTY_PROFILE);
  
  const [dashboardPrefs, setDashboardPrefs] = useState(() => {
    const saved = localStorage.getItem('dashboardPreferences');
    if (saved) {
      try {
        return { ...defaultDashboardPreferences, ...JSON.parse(saved) };
      } catch (e) {
        return defaultDashboardPreferences;
      }
    }
    return defaultDashboardPreferences;
  });
  const [savedDashboardPrefs, setSavedDashboardPrefs] = useState(dashboardPrefs);

  // Backups
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);
  const [choosingFolder, setChoosingFolder] = useState(false);

  const loadBackups = useCallback(async () => {
    try {
      setBackupInfo(await getBackups());
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  }, [addToast]);

  useEffect(() => {
    getFirmProfile()
      .then((data) => {
        setProfile(data);
        setSavedProfile(data);
      })
      .catch((err) => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBackups(); }, [loadBackups]);

  useEffect(() => {
    const changed = JSON.stringify(profile) !== JSON.stringify(savedProfile) ||
                    JSON.stringify(dashboardPrefs) !== JSON.stringify(savedDashboardPrefs);
    setHasChanges(changed);
  }, [profile, savedProfile, dashboardPrefs, savedDashboardPrefs]);

  const handleChange = (field: keyof FirmProfile, value: string | number) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleDashboardPrefChange = (key: keyof typeof defaultDashboardPreferences) => {
    setDashboardPrefs((prev: typeof defaultDashboardPreferences) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateFirmProfile(profile);
      setProfile(updated);
      setSavedProfile(updated);
      
      localStorage.setItem('dashboardPreferences', JSON.stringify(dashboardPrefs));
      setSavedDashboardPrefs(dashboardPrefs);
      
      addToast('Settings saved successfully', 'success');
      loadBackups(); // the backup folder may have changed
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Opens the system folder dialog: Electron's own dialog in the desktop app, otherwise one opened by the local server
  const handleChooseBackupFolder = async () => {
    if (choosingFolder) return;
    setChoosingFolder(true);
    const startDir = profile.backup_dir || backupInfo?.defaultDir;
    try {
      const picked = window.electronAPI?.selectFolder
        ? await window.electronAPI.selectFolder(startDir)
        : (await chooseBackupFolder(startDir)).path;
      if (picked) handleChange('backup_dir', picked);
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setChoosingFolder(false);
    }
  };

  const handleBackupNow = async () => {
    setBackingUp(true);
    try {
      const backup = await createBackupNow();
      addToast(`Backup saved: ${backup.file}`, 'success');
      loadBackups();
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async (backup: BackupFile) => {
    const ok = confirm(
      `Replace ALL current data with the backup from ${formatBackupDate(backup.created_at)}?\n\n` +
      'A copy of your current data will be saved to the backup folder first.'
    );
    if (!ok) return;
    setRestoringFile(backup.file);
    try {
      const result = await restoreBackup(backup.file);
      // Restored data includes the firm profile, so reload it
      const data = await getFirmProfile();
      setProfile(data);
      setSavedProfile(data);
      loadBackups();
      addToast(`${result.message}. Your previous data was saved as ${result.safetyBackup}`, 'success');
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    } finally {
      setRestoringFile(null);
    }
  };

  const lastBackup = backupInfo?.backups.find((b) => b.kind === 'regular');
  const keepOptions = BACKUP_KEEP_OPTIONS.includes(profile.backup_keep)
    ? BACKUP_KEEP_OPTIONS
    : [...BACKUP_KEEP_OPTIONS, profile.backup_keep].sort((a, b) => a - b);

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
            <button className="btn btn-outline" onClick={() => { setProfile(savedProfile); setDashboardPrefs(savedDashboardPrefs); }}>
              Discard
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{ opacity: saving || !hasChanges ? 0.5 : 1 }}
          >
            {saving ? <><Loader2 size={16} className="spinner" style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', width: 16, height: 16 }} /> Saving…</> : <><Save size={16} /> Save Changes</>}
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
                    placeholder="e.g. Subramaniam & Associates"
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
                      placeholder="e.g. +91 9876543210"
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
                      placeholder="Your name here"
                      value={profile.bank_account_name}
                      onChange={(e) => handleChange('bank_account_name', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Bank Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Bank name here"
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
                      placeholder="Acc number here"
                      value={profile.bank_account_number}
                      onChange={(e) => handleChange('bank_account_number', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">IFSC Code</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="IFSC code here"
                      value={profile.bank_ifsc}
                      onChange={(e) => handleChange('bank_ifsc', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">PAN Number</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="PAN number here"
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
                    placeholder="Signature name here eg: V.S.Vasani"
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
                    placeholder="Full name and title here"
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
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={20} /> Email Client</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, marginTop: -8 }}>
                Choose your preferred mail application. Invoices and reminders will open directly in the selected client.
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  {
                    key: 'apple_mail' as const,
                    label: 'Apple Mail',
                    desc: 'Opens Mail.app with the invoice PDF auto-attached (macOS only)',
                    badge: 'Auto-Attach',
                    badgeClass: 'badge paid',
                    icon: <Monitor size={18} />,
                  },
                  {
                    key: 'outlook' as const,
                    label: 'Microsoft Outlook (Desktop)',
                    desc: 'Opens Outlook app with the invoice PDF auto-attached (macOS only - Windows support coming soon)',
                    badge: 'Auto-Attach',
                    badgeClass: 'badge paid',
                    icon: <Monitor size={18} />,
                  },
                  {
                    key: 'gmail_web' as const,
                    label: 'Gmail (Web)',
                    desc: 'Opens Gmail compose in your browser. PDF downloads automatically for attachment.',
                    badge: 'Browser',
                    badgeClass: 'badge draft',
                    icon: <Globe size={18} />,
                  },
                  {
                    key: 'outlook_web' as const,
                    label: 'Outlook (Web)',
                    desc: 'Opens Outlook Web compose in your browser. PDF downloads automatically for attachment.',
                    badge: 'Browser',
                    badgeClass: 'badge draft',
                    icon: <Globe size={18} />,
                  },
                  {
                    key: 'mailto' as const,
                    label: 'Default Mail Client',
                    desc: 'Opens your system default via mailto: link (manual attachment required)',
                    badge: 'Manual Attach',
                    badgeClass: 'badge sent',
                    icon: <Mail size={18} />,
                  },
                ].map(opt => {
                  const isSelected = profile.email_client === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleChange('email_client', opt.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '14px 16px',
                        background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-glass)',
                        borderRadius: 'var(--radius-sm)',
                        border: isSelected ? '2px solid var(--accent-blue)' : '1px solid var(--border-color)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                        width: '100%',
                      }}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isSelected ? 'var(--accent-blue)' : 'var(--bg-tertiary, rgba(0,0,0,0.06))',
                        color: isSelected ? '#fff' : 'var(--text-secondary)',
                        flexShrink: 0,
                        transition: 'all 0.2s ease',
                      }}>
                        {isSelected ? <Check size={18} /> : opt.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-heading)', marginBottom: 2 }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {opt.desc}
                        </div>
                      </div>
                      <span
                        className={opt.badgeClass}
                        style={{ fontSize: 10, flexShrink: 0 }}
                      >
                        {opt.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Dashboard Layout */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LayoutDashboard size={20} /> Dashboard Layout</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, marginTop: -8 }}>
                Select which statistic tiles you want to see on your dashboard.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.totalBilled} onChange={() => handleDashboardPrefChange('totalBilled')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Total Billed</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.totalReceived} onChange={() => handleDashboardPrefChange('totalReceived')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Total Received</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.tds} onChange={() => handleDashboardPrefChange('tds')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>TDS Deducted</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.outstanding} onChange={() => handleDashboardPrefChange('outstanding')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Outstanding</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.clients} onChange={() => handleDashboardPrefChange('clients')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Clients</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.totalInvoices} onChange={() => handleDashboardPrefChange('totalInvoices')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Total Invoices</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.paid} onChange={() => handleDashboardPrefChange('paid')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Paid</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.unpaid} onChange={() => handleDashboardPrefChange('unpaid')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Unpaid Invoices</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.sent} onChange={() => handleDashboardPrefChange('sent')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Sent</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dashboardPrefs.drafts} onChange={() => handleDashboardPrefChange('drafts')} />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Drafts</span>
                </label>
              </div>
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
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Every PDF & Excel export is saved in the copies/ directory after manual download</div>
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

          {/* Backups */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DatabaseBackup size={20} /> Backups</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, marginTop: -8 }}>
                Keeps copies of all your clients, memos, payments and settings. Choose a folder inside iCloud Drive, Google Drive or OneDrive to keep an off-site copy.
              </p>
              <div style={{ display: 'grid', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!profile.backup_enabled}
                    onChange={(e) => handleChange('backup_enabled', e.target.checked ? 1 : 0)}
                  />
                  <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Back up automatically once a day</span>
                </label>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Backup Folder</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={backupInfo ? `Default: ${backupInfo.defaultDir}` : 'Default folder'}
                      value={profile.backup_dir}
                      onClick={handleChooseBackupFolder}
                      readOnly
                      title="Click to choose a folder"
                      style={{ flex: 1, cursor: 'pointer' }}
                    />
                    <button type="button" className="btn btn-outline btn-sm" onClick={handleChooseBackupFolder} disabled={choosingFolder}>
                      <FolderOpen size={15} /> {choosingFolder ? 'Choosing…' : 'Choose…'}
                    </button>
                    {profile.backup_dir && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => handleChange('backup_dir', '')}>
                        Use default
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Opens your system's folder picker. Changes apply after you save.
                  </span>
                </div>
                <div className="form-group" style={{ marginBottom: 0, maxWidth: 240 }}>
                  <label className="form-label">Keep</label>
                  <select
                    className="form-select"
                    value={profile.backup_keep}
                    onChange={(e) => handleChange('backup_keep', Number(e.target.value))}
                  >
                    {keepOptions.map((n) => (
                      <option key={n} value={n}>Last {n} backups</option>
                    ))}
                  </select>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: 'var(--bg-glass)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {lastBackup ? `Last backup: ${formatBackupDate(lastBackup.created_at)}` : 'No backups yet'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                      {backupInfo ? `Saved in ${backupInfo.dir}` : 'Loading…'}
                    </div>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleBackupNow} disabled={backingUp} style={{ flexShrink: 0 }}>
                    {backingUp ? <><Loader2 size={15} className="spinner" style={{ borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white', width: 15, height: 15 }} /> Backing up…</> : <><DatabaseBackup size={15} /> Back up now</>}
                  </button>
                </div>
                {backupInfo && backupInfo.backups.length > 0 && (
                  <div className="table-container" style={{ maxHeight: 280 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Size</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupInfo.backups.map((b) => (
                          <tr key={b.file}>
                            <td>
                              {formatBackupDate(b.created_at)}
                              {b.kind === 'pre-restore' && (
                                <span className="badge draft" style={{ fontSize: 10, marginLeft: 8 }}>Before restore</span>
                              )}
                            </td>
                            <td>{formatSize(b.size)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => handleRestore(b)}
                                disabled={restoringFile !== null}
                              >
                                {restoringFile === b.file ? 'Restoring…' : <><ArchiveRestore size={15} /> Restore</>}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* About */}
          <div className="card">
            <div className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Info size={20} /> About</h3>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8 }}>
                <p><strong>LexLedger</strong> v1.3.1</p>
                <p>A lightweight and easy-to-use invoicing and billing tool designed for legal practices.</p>
                <div style={{ marginTop: 12 }}>
                  <strong>Key Features:</strong>
                  <ul style={{ paddingLeft: 20, margin: 0 }}>
                    <li><strong>Standalone Desktop App:</strong> Native experience for macOS & Windows.</li>
                    <li><strong>Flexible Invoicing:</strong> Generate professional PDF invoices with auto-numbering.</li>
                    <li><strong>Payment Management:</strong> Advanced tracking for partial payments & TDS.</li>
                    <li><strong>Client Management:</strong> Maintain a database of clients with contact details.</li>
                    <li><strong>Email Integration:</strong> Seamless integration with native email clients.</li>
                    <li><strong>Bulk Export:</strong> Export invoice records to Excel for custom date ranges.</li>
                    <li><strong>Customization:</strong> Fully editable firm profiles.</li>
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
