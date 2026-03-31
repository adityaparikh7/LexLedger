import { Router, Request, Response } from 'express';
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
      });
    }
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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
    } = req.body;

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
      smtp_pass ?? ''
    );

    const updated = db.prepare('SELECT * FROM firm_profile WHERE id = 1').get();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Helper: retrieve the firm profile for use in generators */
export function getFirmProfile(): FirmProfile {
  const profile = db.prepare('SELECT * FROM firm_profile WHERE id = 1').get() as FirmProfile | undefined;
  return profile ?? {
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
    updated_at: '',
  };
}

export default router;
