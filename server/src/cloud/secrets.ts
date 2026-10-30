import crypto from 'crypto';

// Encrypts stored secrets (the firm's SMTP password) with AES-256-GCM.
// SMTP_ENCRYPTION_KEY is 32 bytes, base64 encoded: `openssl rand -base64 32`.

function getKey(): Buffer | null {
  const raw = process.env.SMTP_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('SMTP_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
  return key;
}

export function canEncryptSecrets(): boolean {
  return getKey() !== null;
}

/** Returns "v1:<iv>:<tag>:<ciphertext>" (base64 parts), or '' for an empty value. */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const key = getKey();
  if (!key) throw new Error('SMTP_ENCRYPTION_KEY is not set');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  const key = getKey();
  if (!key) throw new Error('SMTP_ENCRYPTION_KEY is not set');
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1') throw new Error('Unknown secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
