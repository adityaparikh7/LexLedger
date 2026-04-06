import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'legalbill.db');

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
      date_paid TEXT,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','unpaid','cancelled')),
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
      amount_received REAL DEFAULT 0,
      tds_amount REAL DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount_received REAL DEFAULT 0,
      tds_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS firm_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      firm_name TEXT NOT NULL DEFAULT '',
      firm_address TEXT NOT NULL DEFAULT '',
      firm_phone TEXT NOT NULL DEFAULT '',
      firm_email TEXT NOT NULL DEFAULT '',
      bank_account_name TEXT NOT NULL DEFAULT '',
      bank_name TEXT NOT NULL DEFAULT '',
      bank_account_number TEXT NOT NULL DEFAULT '',
      bank_ifsc TEXT NOT NULL DEFAULT '',
      pan_number TEXT NOT NULL DEFAULT '',
      signature_name TEXT NOT NULL DEFAULT '',
      signature_full TEXT NOT NULL DEFAULT '',
      smtp_host TEXT NOT NULL DEFAULT '',
      smtp_port INTEGER NOT NULL DEFAULT 587,
      smtp_user TEXT NOT NULL DEFAULT '',
      smtp_pass TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO firm_profile (id) VALUES (1);
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

  // Migration: rename due_date to date_paid
  try {
    db.exec(`ALTER TABLE invoices RENAME COLUMN due_date TO date_paid`);
  } catch (_) {
    // Column might already be renamed or doesn't exist — ignore
  }

  // Migration: add TDS payment columns
  const tdsColumns = ['amount_received', 'tds_amount'];
  for (const col of tdsColumns) {
    try {
      db.exec(`ALTER TABLE invoices ADD COLUMN ${col} REAL DEFAULT 0`);
    } catch (_) {
      // Column already exists — ignore
    }
  }

  // Migration: create payments table if not exists (for existing databases)
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      amount_received REAL DEFAULT 0,
      tds_amount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );
  `);

  // Migration: add SMTP details to firm_profile
  const smtpColumns = [
    { name: 'smtp_host', type: 'TEXT NOT NULL DEFAULT ""' },
    { name: 'smtp_port', type: 'INTEGER NOT NULL DEFAULT 587' },
    { name: 'smtp_user', type: 'TEXT NOT NULL DEFAULT ""' },
    { name: 'smtp_pass', type: 'TEXT NOT NULL DEFAULT ""' }
  ];
  for (const col of smtpColumns) {
    try {
      db.exec(`ALTER TABLE firm_profile ADD COLUMN ${col.name} ${col.type}`);
    } catch (_) {
      // Column already exists — ignore
    }
  }

  // Migration: rebuild invoices table to change CHECK constraint from 'overdue' to 'unpaid'
  // SQLite does not support ALTER TABLE to modify CHECK constraints; a full table rebuild is required.
  try {
    const tableInfo = db.prepare("PRAGMA table_info(invoices)").all() as any[];
    const hasOldConstraint = tableInfo.length > 0; // table exists
    if (hasOldConstraint) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS invoices_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_number TEXT UNIQUE NOT NULL,
          client_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          date_paid TEXT,
          status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','unpaid','cancelled')),
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
          amount_received REAL DEFAULT 0,
          tds_amount REAL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
        );
      `);
      // Copy data, converting 'overdue' -> 'unpaid'
      db.exec(`
        INSERT OR IGNORE INTO invoices_new
          SELECT id, invoice_number, client_id, date, date_paid,
            CASE WHEN status = 'overdue' THEN 'unpaid' ELSE status END,
            notes, case_name, case_party1_type, case_plaintiff, case_party2_type, case_defendant,
            subtotal, tax_rate, tax_amount, total, amount_received, tds_amount,
            created_at, updated_at
          FROM invoices;
      `);
      db.exec(`DROP TABLE invoices;`);
      db.exec(`ALTER TABLE invoices_new RENAME TO invoices;`);
    }
  } catch (_) {
    // Table already rebuilt or migration not needed
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
