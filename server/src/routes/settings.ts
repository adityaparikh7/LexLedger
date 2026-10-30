import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db';

const router = Router();

export interface FirmProfile {
  firm_name: string;
  firm_address: string;
  firm_phone: string;
  firm_email: string;
  bank_account_name: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  pan_number: string;
  signature_name: string;
  signature_full: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  email_client: 'apple_mail' | 'outlook' | 'gmail_web' | 'outlook_web' | 'mailto';
  backup_enabled: number;
  backup_dir: string;
  backup_keep: number;
  updated_at: string;
}

// GET firm profile
router.get('/firm-profile', (_req: Request, res: Response) => {
  try {
    const profile = db.prepare('SELECT * FROM firm_profile WHERE id = 1').get() as FirmProfile | undefined;
    if (!profile) {
      return res.json({
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
      });
    }
    // Graceful migration: if stored value is 'smtp', return 'mailto' instead
    if (profile.email_client === ('smtp' as any)) {
      profile.email_client = 'mailto';
    }
    // Mask password before sending to frontend
    if (profile.smtp_pass) {
      profile.smtp_pass = '********';
    }
    res.json(profile);
  } catch (err: any) {
    console.error('Error fetching firm profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update firm profile
router.put('/firm-profile', (req: Request, res: Response) => {
  try {
    const {
      firm_name,
      firm_address,
      firm_phone,
      firm_email,
      bank_account_name,
      bank_name,
      bank_account_number,
      bank_ifsc,
      pan_number,
      signature_name,
      signature_full,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
      email_client,
      backup_enabled,
      backup_dir,
      backup_keep,
    } = req.body;

    // A custom backup folder must be an absolute path we can write to (created if missing)
    const finalBackupDir = typeof backup_dir === 'string' ? backup_dir.trim() : '';
    if (finalBackupDir) {
      if (!path.isAbsolute(finalBackupDir)) {
        return res.status(400).json({ error: 'Backup folder must be a full path, e.g. /Users/you/Backups' });
      }
      try {
        fs.mkdirSync(finalBackupDir, { recursive: true });
        fs.accessSync(finalBackupDir, fs.constants.W_OK);
      } catch (_) {
        return res.status(400).json({ error: `Backup folder isn't writable: ${finalBackupDir}` });
      }
    }
    const finalBackupKeep = Math.max(1, Math.floor(Number(backup_keep) || 30));

    // Only update password if it's not the masked value
    const currentProfile = getFirmProfile();
    const finalSmtpPass = (smtp_pass === '********' || smtp_pass === undefined) 
      ? currentProfile.smtp_pass 
      : smtp_pass;

    db.prepare(`
      UPDATE firm_profile SET
        firm_name = ?,
        firm_address = ?,
        firm_phone = ?,
        firm_email = ?,
        bank_account_name = ?,
        bank_name = ?,
        bank_account_number = ?,
        bank_ifsc = ?,
        pan_number = ?,
        signature_name = ?,
        signature_full = ?,
        smtp_host = ?,
        smtp_port = ?,
        smtp_user = ?,
        smtp_pass = ?,
        email_client = ?,
        backup_enabled = ?,
        backup_dir = ?,
        backup_keep = ?,
        updated_at = datetime('now')
      WHERE id = 1
    `).run(
      firm_name ?? '',
      firm_address ?? '',
      firm_phone ?? '',
      firm_email ?? '',
      bank_account_name ?? '',
      bank_name ?? '',
      bank_account_number ?? '',
      bank_ifsc ?? '',
      pan_number ?? '',
      signature_name ?? '',
      signature_full ?? '',
      smtp_host ?? '',
      smtp_port ?? 587,
      smtp_user ?? '',
      finalSmtpPass ?? '',
      email_client ?? 'mailto',
      (backup_enabled ?? 1) ? 1 : 0,
      finalBackupDir,
      finalBackupKeep
    );

    const updated = db.prepare('SELECT * FROM firm_profile WHERE id = 1').get() as FirmProfile;
    if (updated.smtp_pass) {
      updated.smtp_pass = '********';
    }
    res.json(updated);
  } catch (err: any) {
    console.error('Error updating firm profile:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** Helper: retrieve the firm profile for use in generators */
export function getFirmProfile(): FirmProfile {
  const profile = db.prepare('SELECT * FROM firm_profile WHERE id = 1').get() as FirmProfile | undefined;
  if (!profile) {
    return {
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
      updated_at: '',
    };
  }
  // Graceful migration: if stored value is 'smtp', treat as 'mailto'
  if (profile.email_client === ('smtp' as any)) {
    profile.email_client = 'mailto';
  }
  return profile;
}

export default router;
