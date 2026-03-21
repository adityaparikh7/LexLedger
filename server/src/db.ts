import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'legalbill.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      client_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','overdue','cancelled')),
      notes TEXT,
      case_name TEXT,
      case_party1_type TEXT,
      case_plaintiff TEXT,
      case_party2_type TEXT,
      case_defendant TEXT,
      subtotal REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      hours REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoice_copies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      file_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
  `);

  // Migration: add case detail columns to existing databases
  const migrationColumns = ['case_name', 'case_party1_type', 'case_plaintiff', 'case_party2_type', 'case_defendant'];
  for (const col of migrationColumns) {
    try {
      db.exec(`ALTER TABLE invoices ADD COLUMN ${col} TEXT`);
    } catch (_) {
      // Column already exists — ignore
    }
  }
}

export function generateInvoiceNumber(invoiceDateStr?: string): string {
  const now = invoiceDateStr ? new Date(invoiceDateStr) : new Date();
  
  // Financial year logic: April 1 to March 31
  let startYear = now.getFullYear();
  let endYear = startYear + 1;
  
  // If month is Jan, Feb, or Mar (0, 1, 2), it's part of previous year's financial year
  if (now.getMonth() < 3) {
    startYear -= 1;
    endYear -= 1;
  }
  
  // Format as YYYY-YY (e.g., 2025-26)
  const fyString = `${startYear}-${String(endYear).slice(-2)}`;
  
  // Look for invoices in this financial year
  const searchPattern = `%/${fyString}`;

  const rows = db.prepare(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ?`
  ).all(searchPattern) as { invoice_number: string }[];

  let maxSeq = 0;
  for (const row of rows) {
    const seqStr = row.invoice_number.split('/')[0];
    const seq = parseInt(seqStr, 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const nextSeq = maxSeq + 1;
  return `${nextSeq}/${fyString}`;
}

export default db;
