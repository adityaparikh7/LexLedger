import { useState, useEffect, useContext, useCallback, useRef, type ReactNode } from 'react';
import {
  getFirmProfile, updateFirmProfile, getBackups, createBackupNow, restoreBackup, chooseBackupFolder,
  type FirmProfile, type BackupInfo, type BackupFile
} from '../api';
import { ToastContext } from '../context/ToastContext';
import { FIRM_PROFILE_EVENT } from '../events';
import {
  DASHBOARD_CARD_GROUPS, loadDashboardPreferences, saveDashboardPreferences,
  type DashboardPreferences, type DashboardPrefKey,
} from '../dashboardPrefs';
import {
  Landmark, Banknote, PenLine, Mail, FileText, Info, Save, Loader2, Check, LayoutDashboard, DatabaseBackup,
  FolderOpen, ArchiveRestore, Scale,
} from 'lucide-react';
import { CardHeader, Loading, PageHeader } from '../components/ui';
import ConfirmDialog from '../components/ConfirmDialog';

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

const EMAIL_CLIENTS: { key: FirmProfile['email_client']; label: string; desc: string; tag: string }[] = [
  { key: 'apple_mail', label: 'Apple Mail', desc: 'Opens Mail with the invoice PDF attached (macOS only)', tag: 'Auto-attach' },
  { key: 'outlook', label: 'Microsoft Outlook (desktop)', desc: 'Opens Outlook with the invoice PDF attached', tag: 'Auto-attach' },
  { key: 'gmail_web', label: 'Gmail (web)', desc: 'Opens Gmail compose in your browser; the PDF downloads for you to attach', tag: 'Browser' },
  { key: 'outlook_web', label: 'Outlook (web)', desc: 'Opens Outlook on the web; the PDF downloads for you to attach', tag: 'Browser' },
  { key: 'mailto', label: 'Default mail client', desc: 'Opens your system mail app via mailto (attach the PDF manually)', tag: 'Manual attach' },
];

const SECTIONS = [
  ['firm', 'Firm identity'],
  ['bank', 'Bank details'],
  ['signature', 'Signature'],
  ['email', 'Email client'],
  ['dashboard', 'Dashboard layout'],
  ['invoice', 'Invoice settings'],
  ['backups', 'Backups'],
  ['about', 'About'],
] as const;

function TextField({ id, label, value, onChange, placeholder, type = 'text', helper }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  helper?: string;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} type={type} className="input" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      {helper && <span className="field-helper">{helper}</span>}
    </div>
  );
}

function Section({ id, title, subtitle, icon, children }: { id: string; title: string; subtitle?: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="card" id={`settings-${id}`} data-section={id}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      {children}
    </section>
  );
}

export default function Settings() {
  const { addToast } = useContext(ToastContext);
  const [profile, setProfile] = useState<FirmProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedProfile, setSavedProfile] = useState<FirmProfile>(EMPTY_PROFILE);
  const [activeSection, setActiveSection] = useState<string>('firm');
  const sectionsRef = useRef<HTMLDivElement>(null);

  const [dashboardPrefs, setDashboardPrefs] = useState<DashboardPreferences>(loadDashboardPreferences);
  const [savedDashboardPrefs, setSavedDashboardPrefs] = useState(dashboardPrefs);

  // Backups
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [toRestore, setToRestore] = useState<BackupFile | null>(null);
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
  }, [addToast]);

  useEffect(() => { loadBackups(); }, [loadBackups]);

  // Highlight the section nav item for the card nearest the top of the scroll area
  useEffect(() => {
    if (loading || !sectionsRef.current) return;
    const root = document.querySelector('.main-content');
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSection((visible[0].target as HTMLElement).dataset.section || 'firm');
    }, { root, rootMargin: '0px 0px -70% 0px' });
    sectionsRef.current.querySelectorAll('[data-section]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [loading]);

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(savedProfile) ||
    JSON.stringify(dashboardPrefs) !== JSON.stringify(savedDashboardPrefs);

  const handleChange = (field: keyof FirmProfile, value: string | number) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };
  const text = (field: keyof FirmProfile) => ({
    value: String(profile[field] ?? ''),
    onChange: (v: string) => handleChange(field, v),
  });

  const handleDashboardPrefChange = (key: DashboardPrefKey) => {
    setDashboardPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateFirmProfile(profile);
      setProfile(updated);
      setSavedProfile(updated);

      saveDashboardPreferences(dashboardPrefs);
      setSavedDashboardPrefs(dashboardPrefs);

      window.dispatchEvent(new Event(FIRM_PROFILE_EVENT));
      addToast('Settings saved', 'success');
      loadBackups(); // the backup folder may have changed
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
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

  const handleRestore = async () => {
    if (!toRestore) return;
    try {
      const result = await restoreBackup(toRestore.file);
      // Restored data includes the firm profile, so reload it
      const data = await getFirmProfile();
      setProfile(data);
      setSavedProfile(data);
      window.dispatchEvent(new Event(FIRM_PROFILE_EVENT));
      loadBackups();
      addToast(`${result.message}. Your previous data was saved as ${result.safetyBackup}`, 'success');
    } catch (err: unknown) {
      addToast((err as Error).message, 'error');
    }
  };

  const jumpTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const lastBackup = backupInfo?.backups.find((b) => b.kind === 'regular');
  const keepOptions = BACKUP_KEEP_OPTIONS.includes(profile.backup_keep)
    ? BACKUP_KEEP_OPTIONS
    : [...BACKUP_KEEP_OPTIONS, profile.backup_keep].sort((a, b) => a - b);

  const isProfileEmpty = !profile.firm_name && !profile.firm_address && !profile.firm_email;

  return (
    <div className="page">
      <PageHeader
        title="Settings"
        subtitle="Firm details, invoice preferences and backups"
        actions={<>
          {hasChanges && (
            <button className="btn btn-secondary" onClick={() => { setProfile(savedProfile); setDashboardPrefs(savedDashboardPrefs); }}>
              Discard
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>}
      />

      {loading ? <Loading /> : (
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map(([id, label]) => (
              <button key={id} type="button" className={activeSection === id ? 'active' : ''} onClick={() => jumpTo(id)}>{label}</button>
            ))}
          </nav>

          <div className="settings-sections" ref={sectionsRef}>
            {isProfileEmpty && (
              <div className="info-banner">
                <Scale size={20} />
                <span>Welcome! Fill in your firm details below — they appear on every invoice memo and export.</span>
              </div>
            )}

            <Section id="firm" title="Firm identity" icon={<Landmark size={18} />}>
              <TextField id="firm-name" label="Firm / advocate name" placeholder="e.g. Mehta & Associates" {...text('firm_name')} />
              <TextField id="firm-address" label="Address" placeholder="e.g. 402, Lawyers Chambers, Fort, Mumbai 400001" {...text('firm_address')} />
              <div className="form-grid cols-2">
                <TextField id="firm-phone" label="Phone" placeholder="e.g. +91 22 2266 1234" {...text('firm_phone')} />
                <TextField id="firm-email" type="email" label="Email" placeholder="e.g. office@firm.in" {...text('firm_email')} />
              </div>
            </Section>

            <Section id="bank" title="Bank details" subtitle="Printed on invoice memos as payment instructions" icon={<Banknote size={18} />}>
              <div className="form-grid cols-2">
                <TextField id="bank-account-name" label="Account name" {...text('bank_account_name')} />
                <TextField id="bank-name" label="Bank name" {...text('bank_name')} />
              </div>
              <div className="form-grid cols-3">
                <TextField id="bank-account-number" label="Account number" {...text('bank_account_number')} />
                <TextField id="bank-ifsc" label="IFSC code" {...text('bank_ifsc')} />
                <TextField id="pan" label="PAN" {...text('pan_number')} />
              </div>
            </Section>

            <Section id="signature" title="Signature" subtitle="Appears at the bottom of your invoice memos" icon={<PenLine size={18} />}>
              <div className="form-grid cols-2">
                <TextField id="sig-short" label="Signature name (short)" placeholder="e.g. R. Mehta" helper="Rendered in cursive on the memo" {...text('signature_name')} />
                <TextField id="sig-full" label="Full name & title" placeholder="e.g. Rohan Mehta, Advocate" helper="Printed below the signature" {...text('signature_full')} />
              </div>
            </Section>

            <Section id="email" title="Email client" subtitle="Invoices and reminders open in the client you choose" icon={<Mail size={18} />}>
              <div className="option-list" role="radiogroup" aria-label="Email client">
                {EMAIL_CLIENTS.map(opt => {
                  const selected = profile.email_client === opt.key;
                  return (
                    <button key={opt.key} type="button" role="radio" aria-checked={selected}
                      className={`option-row${selected ? ' selected' : ''}`} onClick={() => handleChange('email_client', opt.key)}>
                      <span className="radio" />
                      <span className="option-text">
                        <span className="text-strong">{opt.label}</span>
                        <span className="small text-muted">{opt.desc}</span>
                      </span>
                      <span className="tag">{opt.tag}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section id="dashboard" title="Dashboard layout" subtitle="Choose which cards appear on your dashboard" icon={<LayoutDashboard size={18} />}>
              {DASHBOARD_CARD_GROUPS.map(group => (
                <fieldset key={group.title} className="check-group">
                  <legend className="field-label">{group.title}</legend>
                  <div className="check-grid">
                    {group.items.map(([key, label]) => (
                      <label key={key} className="check">
                        <input type="checkbox" checked={dashboardPrefs[key]} onChange={() => handleDashboardPrefChange(key)} />
                        <span className="check-box"><Check size={16} strokeWidth={3} /></span>
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </Section>

            <Section id="invoice" title="Invoice settings" subtitle="How LexLedger numbers and stores your invoices" icon={<FileText size={18} />}>
              {[
                ['Invoice number format', 'Assigned automatically as sequence/financial year, e.g. 5/2026-27', 'Automatic'],
                ['Saved copies', 'Every PDF and Excel file you download is also kept in the copies folder', 'On'],
                ['Invoice date', 'New invoices start with today’s date, which you can change', 'Today'],
              ].map(([title, desc, tag]) => (
                <div key={title} className="panel">
                  <div className="panel-text">
                    <span className="text-strong">{title}</span>
                    <span className="small text-muted">{desc}</span>
                  </div>
                  <span className="tag">{tag}</span>
                </div>
              ))}
            </Section>

            <Section id="backups" title="Backups" subtitle="Keeps copies of your clients, invoices, payments and settings" icon={<DatabaseBackup size={18} />}>
              <label className="switch-row">
                <input type="checkbox" checked={!!profile.backup_enabled} onChange={e => handleChange('backup_enabled', e.target.checked ? 1 : 0)} />
                <span className="switch" />
                Back up automatically once a day
              </label>
              <div className="folder-row">
                <div className="field">
                  <label className="field-label" htmlFor="backup-dir">Backup folder</label>
                  <input id="backup-dir" type="text" className="input" readOnly title="Click to choose a folder" style={{ cursor: 'pointer' }}
                    placeholder={backupInfo ? backupInfo.defaultDir : 'Default folder'} value={profile.backup_dir} onClick={handleChooseBackupFolder} />
                </div>
                <button type="button" className="btn btn-secondary" style={{ height: 44 }} onClick={handleChooseBackupFolder} disabled={choosingFolder}>
                  {choosingFolder ? <Loader2 size={18} className="spin" /> : <FolderOpen size={18} />} {choosingFolder ? 'Choosing…' : 'Choose…'}
                </button>
                {profile.backup_dir && (
                  <button type="button" className="btn btn-ghost" style={{ height: 44 }} onClick={() => handleChange('backup_dir', '')}>Use default</button>
                )}
              </div>
              <span className="field-helper" style={{ marginTop: -12 }}>
                Use a folder in iCloud Drive, Google Drive or OneDrive for an off-site copy. Changes apply after you save.
              </span>
              <div className="field" style={{ maxWidth: 240 }}>
                <label className="field-label" htmlFor="backup-keep">Keep</label>
                <select id="backup-keep" className="input" value={profile.backup_keep} onChange={e => handleChange('backup_keep', Number(e.target.value))}>
                  {keepOptions.map(n => <option key={n} value={n}>Last {n} backups</option>)}
                </select>
              </div>
              <div className="panel">
                <div className="panel-text">
                  <span className="text-strong">{lastBackup ? `Last backup: ${formatBackupDate(lastBackup.created_at)}` : 'No backups yet'}</span>
                  <span className="small text-muted" style={{ wordBreak: 'break-all' }}>
                    {backupInfo ? (lastBackup ? `Saved in ${backupInfo.dir}` : 'Back up now to create your first copy') : 'Loading…'}
                  </span>
                </div>
                <button type="button" className="btn btn-secondary" onClick={handleBackupNow} disabled={backingUp}>
                  {backingUp ? <Loader2 size={18} className="spin" /> : <DatabaseBackup size={18} />}
                  {backingUp ? 'Backing up…' : 'Back up now'}
                </button>
              </div>
              {backupInfo && backupInfo.backups.length > 0 && (
                <div className="backup-table">
                  <table className="data-table">
                    <thead>
                      <tr><th>Date</th><th className="right">Size</th><th className="actions-col"><span className="visually-hidden">Restore</span></th></tr>
                    </thead>
                    <tbody>
                      {backupInfo.backups.map(b => (
                        <tr key={b.file}>
                          <td>
                            <span className="nowrap">{formatBackupDate(b.created_at)}</span>
                            {b.kind === 'pre-restore' && <span className="tag" style={{ marginLeft: 8 }}>Before restore</span>}
                          </td>
                          <td className="right text-secondary nowrap">{formatSize(b.size)}</td>
                          <td className="actions-col">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setToRestore(b)}>
                              <ArchiveRestore size={18} /> Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section id="about" title="About" icon={<Info size={18} />}>
              <p className="text-secondary">
                <strong className="text-strong">LexLedger</strong> v1.3.2 — a lightweight invoicing and client management tool designed for Indian legal practices.
              </p>
            </Section>
          </div>
        </div>
      )}

      {toRestore && (
        <ConfirmDialog
          tone="primary"
          icon={<ArchiveRestore size={20} />}
          title="Restore this backup?"
          body={<>All current data will be replaced with the backup from {formatBackupDate(toRestore.created_at)}. A copy of your current data is saved to the backup folder first.</>}
          confirmLabel="Restore backup"
          onConfirm={handleRestore}
          onClose={() => setToRestore(null)}
        />
      )}
    </div>
  );
}
