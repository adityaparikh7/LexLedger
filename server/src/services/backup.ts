import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import db, { DB_PATH, initDatabase } from '../db';
import { getFirmProfile } from '../routes/settings';

// lexledger-2026-10-06-093015.db  /  lexledger-pre-restore-2026-10-06-093015.db  (local time)
const BACKUP_PATTERN = /^lexledger-(pre-restore-)?(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.db$/;
const REQUIRED_TABLES = ['clients', 'invoices', 'line_items', 'payments', 'firm_profile'];
const DAY_MS = 24 * 60 * 60 * 1000;

export type BackupKind = 'regular' | 'pre-restore';

export interface BackupFile {
  file: string;
  kind: BackupKind;
  /** Local time parsed from the file name, YYYY-MM-DDTHH:mm:ss */
  created_at: string;
  size: number;
}

/** Thrown for problems the user can fix (bad file, missing backup) — routes answer these with a 400 */
export class BackupError extends Error {}

export function getDefaultBackupDir(): string {
  return path.join(path.dirname(DB_PATH), 'backups');
}

export function getBackupDir(): string {
  return getFirmProfile().backup_dir || getDefaultBackupDir();
}

function fileTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toBackupFile(dir: string, file: string): BackupFile | null {
  const m = BACKUP_PATTERN.exec(file);
  if (!m) return null;
  try {
    const { size } = fs.statSync(path.join(dir, file));
    return {
      file,
      kind: m[1] ? 'pre-restore' : 'regular',
      created_at: `${m[2]}-${m[3]}-${m[4]}T${m[5]}:${m[6]}:${m[7]}`,
      size,
    };
  } catch (_) {
    return null;
  }
}

/** Backups in the folder, newest first */
export function listBackups(dir: string = getBackupDir()): BackupFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((file) => toBackupFile(dir, file))
    .filter((b): b is BackupFile => b !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Keep the newest `backup_keep` regular backups. Pre-restore safety copies are never pruned. */
function pruneBackups(dir: string): void {
  const keep = Math.max(1, getFirmProfile().backup_keep || 30);
  const regular = listBackups(dir).filter((b) => b.kind === 'regular');
  for (const old of regular.slice(keep)) {
    try {
      fs.unlinkSync(path.join(dir, old.file));
    } catch (err) {
      console.error(`Could not remove old backup ${old.file}:`, err);
    }
  }
}

// Backups and restores run one at a time (the scheduler and a manual click could otherwise collide)
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function writeBackup(kind: BackupKind): Promise<BackupFile> {
  const dir = getBackupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = `lexledger-${kind === 'pre-restore' ? 'pre-restore-' : ''}${fileTimestamp(new Date())}.db`;
  const finalPath = path.join(dir, file);
  const partialPath = `${finalPath}.partial`;
  fs.rmSync(partialPath, { force: true });

  try {
    // SQLite online backup: a consistent snapshot even while the app is in use (safe under WAL)
    await db.backup(partialPath);
    // Make the copy a single self-contained file, so no -wal/-shm files appear in a synced folder
    const copy = new Database(partialPath);
    try {
      copy.pragma('journal_mode = DELETE');
    } finally {
      copy.close();
    }
    for (const suffix of ['-wal', '-shm']) fs.rmSync(partialPath + suffix, { force: true });
    // Rename only once complete, so a sync client never uploads a half-written file
    fs.renameSync(partialPath, finalPath);
  } catch (err) {
    fs.rmSync(partialPath, { force: true });
    throw err;
  }

  if (kind === 'regular') pruneBackups(dir);
  const backup = toBackupFile(dir, file);
  if (!backup) throw new Error(`Backup was written but could not be read back: ${file}`);
  return backup;
}

export function createBackup(kind: BackupKind = 'regular'): Promise<BackupFile> {
  return serialize(() => writeBackup(kind));
}

/** Daily automatic backup. Never throws — failures are logged. */
export async function runAutoBackupIfDue(): Promise<void> {
  try {
    if (!getFirmProfile().backup_enabled) return;
    // Skip an empty database, so a fresh install pointed at a cloud folder doesn't add an empty backup on top of real ones
    const { count } = db.prepare(
      'SELECT (SELECT COUNT(*) FROM clients) + (SELECT COUNT(*) FROM invoices) AS count'
    ).get() as { count: number };
    if (count === 0) return;
    const latest = listBackups().find((b) => b.kind === 'regular');
    if (latest && Date.now() - new Date(latest.created_at).getTime() < DAY_MS) return;
    const backup = await createBackup('regular');
    console.log(`💾 Automatic backup saved: ${backup.file}`);
  } catch (err) {
    console.error('Automatic backup failed:', err);
  }
}

export function startBackupScheduler(): void {
  // First check shortly after start (so it doesn't slow startup), then hourly
  setTimeout(runAutoBackupIfDue, 10_000).unref();
  setInterval(runAutoBackupIfDue, 60 * 60 * 1000).unref();
}

export interface RestoreResult {
  invoices: number;
  clients: number;
  safetyBackup: string;
}

async function doRestore(file: string): Promise<RestoreResult> {
  // Only plain backup names from the backup folder — no paths
  if (!BACKUP_PATTERN.test(file)) throw new BackupError('Not a LexLedger backup file');
  const sourcePath = path.join(getBackupDir(), file);
  if (!fs.existsSync(sourcePath)) throw new BackupError('Backup file not found');

  let source: Database.Database;
  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  } catch (_) {
    throw new BackupError(`${file} could not be opened as a LexLedger backup`);
  }

  try {
    try {
      const check = source.pragma('quick_check', { simple: true });
      if (check !== 'ok') throw new Error(String(check));
      const tables = (source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[])
        .map((t) => t.name);
      const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t));
      if (missing.length > 0) throw new Error(`missing tables: ${missing.join(', ')}`);
    } catch (err) {
      throw new BackupError(`${file} is not a valid LexLedger backup (${(err as Error).message})`);
    }

    // Backup settings belong to this machine, not to the data being restored
    const { backup_enabled, backup_dir, backup_keep } = getFirmProfile();

    // Safety copy of the current data first
    const safety = await writeBackup('pre-restore');

    // Online backup into the live database: one transaction, so the running server sees the
    // restored data immediately, and a failure part-way leaves the current data untouched
    await source.backup(DB_PATH);
    source.close();

    db.pragma('journal_mode = WAL');
    initDatabase(); // bring an older backup up to the current schema
    db.prepare('UPDATE firm_profile SET backup_enabled = ?, backup_dir = ?, backup_keep = ? WHERE id = 1')
      .run(backup_enabled, backup_dir, backup_keep);

    const invoices = (db.prepare('SELECT COUNT(*) AS count FROM invoices').get() as { count: number }).count;
    const clients = (db.prepare('SELECT COUNT(*) AS count FROM clients').get() as { count: number }).count;
    return { invoices, clients, safetyBackup: safety.file };
  } finally {
    if (source.open) source.close();
  }
}

export function restoreBackup(file: string): Promise<RestoreResult> {
  return serialize(() => doRestore(file));
}
