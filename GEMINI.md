# LexLedger: Legal Invoicing & Billing Management

**Version:** 1.3.0

LexLedger is a full-stack legal invoicing and billing management application designed to streamline client tracking and automated document generation for legal practices. It is structured as a monorepo containing a React frontend, an Express backend, and an Electron wrapper for desktop deployment.

## Project Overview

- **Frontend (`/client`):** A modern, React 19-based single-page application (SPA) built with Vite and TypeScript. It features a premium dark theme with glassmorphism and Lucide icons.
- **Backend (`/server`):** A Node.js/Express server written in TypeScript. It manages a SQLite database and handles complex document generation and email services.
- **Desktop (`/electron`):** An Electron wrapper that packages the application as a standalone macOS desktop app, enabling local and offline use.
- **Database:** SQLite (via `better-sqlite3`), chosen for its portability and zero-config setup.
- **Document Generation:** Utilizes `pdfkit`, `exceljs`, and `puppeteer` to generate high-quality invoices and reports.
- **Emailing:** Integrates `nodemailer` for SMTP-based sending, and a `mailComposer` service for native mail client integration (Apple Mail, Outlook, `mailto:`).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js |
| **Desktop** | Electron |
| **Frontend** | React 19, Vite, TypeScript, React Router, Lucide React |
| **Backend** | Express, TypeScript |
| **Database** | SQLite (`better-sqlite3`) |
| **Reporting**| PDFKit, ExcelJS, Puppeteer |
| **Email** | Nodemailer, Native Mail Client (Apple Mail / Outlook / Gmail Web / Outlook Web / mailto) |

## Key Directory Structure

```text
/
├── client/                   # React frontend source code
│   └── src/
│       ├── api.ts            # Typed API client for all backend calls
│       ├── context/          # React context providers (e.g. ToastContext)
│       └── pages/            # Main application pages
│           ├── Dashboard.tsx
│           ├── Clients.tsx
│           ├── Invoices.tsx
│           ├── InvoiceForm.tsx
│           ├── Export.tsx
│           ├── Settings.tsx
│           └── Support.tsx
├── server/                   # Express backend source code
│   └── src/
│       ├── db.ts             # SQLite schema, migrations, and invoice number generation
│       ├── index.ts          # Express app entry point
│       ├── routes/           # API endpoints
│       │   ├── clients.ts
│       │   ├── dashboard.ts
│       │   ├── invoices.ts   # PDF, Excel, bulk export, send, remind endpoints
│       │   └── settings.ts   # Firm profile CRUD
│       └── services/         # Business logic
│           ├── pdfGenerator.ts       # Per-invoice PDF via PDFKit
│           ├── excelGenerator.ts     # Per-invoice Excel via ExcelJS
│           ├── exportGenerator.ts    # Date-range & bulk PDF/Excel exports
│           ├── emailService.ts       # SMTP-based email (Nodemailer)
│           ├── mailComposer.ts       # Native mail client integration
│           └── memo-template.html    # Puppeteer HTML template for PDF invoices
├── electron/                 # Electron main and preload scripts
│   ├── main.ts
│   └── preload.ts
├── data/                     # Local SQLite database storage (legalbill.db)
├── copies/                   # Redundant storage for generated invoices
└── scripts/                  # Automation and helper scripts (e.g. prepare-puppeteer.js)
```

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `clients` | Client contact information |
| `invoices` | Invoice header, case details, financial totals |
| `line_items` | Individual service line items per invoice |
| `payments` | Payment records (amount received + TDS) per invoice |
| `invoice_copies` | Metadata for generated PDF/Excel files stored in `/copies` |
| `firm_profile` | Singleton row (id=1) for firm details, bank info, SMTP settings, and preferred email client |

### Invoice Status Values
`draft` | `sent` | `paid` | `unpaid` | `cancelled`

> **Note:** The `overdue` status was renamed to `unpaid`. A guarded migration in `db.ts` handles this for existing databases by rebuilding the `invoices` table with foreign keys disabled to prevent cascade deletions.

### Invoice Number Format
Auto-generated as `{sequence}/{FY}` (e.g., `5/2025-26`), scoped to the Indian financial year (April–March).

### PDF File Naming Convention
Downloaded PDFs are named: `Fee Memo No- {invoice_number} {client_name} {DD-MM-YYYY}.pdf`

## API Overview

### Clients — `/api/clients`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all clients |
| GET | `/:id` | Get a single client |
| POST | `/` | Create a client |
| PUT | `/:id` | Update a client |
| DELETE | `/:id` | Delete a client |

### Dashboard — `/api/dashboard`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Get stats and recent invoices (`?timeFilter=all|month|quarter|year|custom&startDate=&endDate=`) |

### Invoices — `/api/invoices`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List invoices (filter by `status`, `client_id`) |
| GET | `/:id` | Get a single invoice with line items, payments, and copies |
| POST | `/` | Create an invoice |
| PUT | `/:id` | Update an invoice |
| DELETE | `/:id` | Delete an invoice |
| PATCH | `/:id/status` | Update status (optionally record payments) |
| PUT | `/:id/payments` | Replace all payment records for an invoice |
| GET | `/:id/pdf` | Download invoice as PDF |
| GET | `/:id/excel` | Download invoice as Excel |
| POST | `/:id/send` | Send invoice via email (SMTP or native mail client) |
| POST | `/:id/remind` | Send payment reminder email |
| GET | `/export` | Date-range Excel export (`?startDate=&endDate=`) |
| GET | `/export-pdfs` | Bulk PDF zip export (`?client_id=&status=`) |

### Settings — `/api/settings`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/firm-profile` | Get firm profile |
| PUT | `/firm-profile` | Update firm profile |

## Email Workflow

LexLedger supports two email delivery modes, configurable per-firm in the Settings page:

1. **SMTP (Nodemailer):** Sends invoices directly using stored SMTP credentials (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`).
2. **Native Mail Client:** Uses `mailComposer.ts` to trigger Apple Mail (macOS) / Outlook (macOS & Windows via PowerShell) with auto-attached PDFs, or generate web mail URLs (Gmail Web / Outlook Web), or a `mailto:` fallback.

The preferred method is stored in `firm_profile.email_client` (`'apple_mail'` | `'outlook'` | `'gmail_web'` | `'outlook_web'` | `'mailto'`).

## Firm Profile

The `firm_profile` table (singleton, `id=1`) stores all configurable firm-level data:
- Firm name, address, phone, email
- Bank account details (name, bank, account number, IFSC)
- PAN number
- Signature name and full designation
- SMTP credentials (`smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`)
- Preferred email client (`email_client`)

This data is used dynamically in PDF/Excel invoice generation via the services layer.

## Development & Build Commands

### Initial Setup
Install dependencies for all workspaces (root, client, and server):
```bash
npm run install:all
```

### Local Web Development
Run the full stack (frontend and backend concurrently) in dev mode:
```bash
npm run dev
```
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3000

### Desktop Development (Electron)
Run the application inside the Electron wrapper:
```bash
npm run electron:dev
```

### Production Build
Build the client and start the production server:
```bash
npm run build
npm run start
```

### Electron Build (macOS)
Compile and package the standalone desktop application:
```bash
npm run electron:build
```

### Electron Build (Windows)
Compile and package the standalone desktop application:
```bash
npm run electron:build-win
```

For a faster build that skips Puppeteer preparation and native module rebuilding:
```bash
npm run electron:build-quick       # macOS
npm run electron:build-quick-win   # Windows
```

### Context Switching (Local vs Electron)
When switching between Electron builds and the local development server, `better-sqlite3` will throw an ABI mismatch error because Electron uses a different Node version environment than your local system.
- To restore the local Node environment for web development: Run `cd server && npm rebuild`
- To rebuild for Electron: The build scripts (`electron:build` and `electron:build-win`) do this automatically using `npm run electron:rebuild-native`. If you need to do it manually, use `npm run electron:rebuild-native`.

## Development Conventions

1. **TypeScript Everywhere:** Ensure strict type safety across both frontend and backend.
2. **Modular Routes:** Group related API endpoints in `server/src/routes/` and keep the logic focused.
3. **Service-Oriented Backend:** Encapsulate complex operations like PDF/Excel generation and email in dedicated service files within `server/src/services/`.
4. **Database Migrations:** Schema changes should be implemented in `server/src/db.ts` using the `initDatabase` migration logic. Always guard migrations with existence checks and disable foreign keys (`PRAGMA foreign_keys = OFF`) when performing table rebuilds to prevent unintended cascade deletions.
5. **Styling:** Follow the established premium dark theme using vanilla CSS or utility classes as found in `client/src/index.css` and component-specific styles.
6. **Electron Native Modules:** If you encounter ABI mismatch errors with `better-sqlite3`, follow the Context Switching rule: use `cd server && npm rebuild` for local Node dev, or `npm run electron:rebuild-native` for Electron builds.
7. **Invoice Numbering:** Always use `generateInvoiceNumber(dateStr?)` from `db.ts` to produce correctly scoped financial-year invoice numbers.
8. **Puppeteer in Electron:** When building the Electron app, Puppeteer's Chrome binary must be bundled as an extra resource. The `npm run electron:prepare-puppeteer` script copies the system's Puppeteer cache into a local `puppeteer-cache` folder for `electron-builder` to bundle.

## Environment Variables

Configure these in a `.env` file at the project root:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DB_PATH` | `data/legalbill.db` | Custom SQLite database path |
| `COPIES_PATH` | `copies/` | Custom path for invoice redundancy storage |

> **Note:** SMTP credentials are no longer stored as environment variables — they are managed via the firm profile in the Settings page and persisted in the database.
