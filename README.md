# LexLedger

LexLedger is a full-stack legal invoicing and billing management application designed to streamline client and invoice tracking. The application provides an intuitive dashboard, client management, and detailed invoice generation features. It can automatically generate invoices in PDF and Excel formats and includes email capabilities.

## Features
- **Desktop Application**: Packaged as a standalone macOS Electron app for offline and local use.
- **Dashboard**: Track overall revenue, outstanding invoices, and billing metrics.
- **Client Management**: Add and manage client details.
- **Invoice Generation**: Create, view, and manage invoices natively, with redesigned and meticulously styled PDF and Excel invoice formats.
- **Payment Tracking**: Track multiple partial payments per invoice, featuring auto-calculated and editable TDS amounts, alongside real-time balance tracking.
- **Export Options**: Export individual beautifully formatted PDFs and Excel spreadsheets, or conditionally perform bulk exports of invoices for custom time periods.
- **Email Service**: Send invoices and memos securely via email.

## Tech Stack
**Desktop**:
- Framework: Electron
- Bundler: `electron-builder`

**Frontend**:
- UI: React (v19)
- Routing: React Router
- Build Tool: Vite
- Language: TypeScript

**Backend**:
- Server: Node.js & Express
- Database: SQLite (via `better-sqlite3`)
- Document Generation: `pdfkit`, `exceljs`, and `puppeteer`
- Email: `nodemailer`
- Language: TypeScript

## Requirements
- **Node.js**: v18.0.0 or higher recommended.
- **npm**: v8.0.0 or higher.

## Steps to Run locally

### 1. Installation
Install dependencies for both the root workspace, client, and server at once using the provided helper script:
```bash
npm run install:all
```

*(Alternatively, you can manually run `npm install` in the root, `/client`, and `/server` directories.)*

### 2. Environment Setup (If required)
Ensure any `.env` files are set up in the `/server` directory for things like `nodemailer` credentials or specific port configurations (see any `.env.example` if applicable).

### 3. Development Server
Run the full stack application (frontend and backend concurrently) in development mode:
```bash
npm run dev
```

This will run:
- The Express backend server (via `tsx watch`).
- The Vite frontend server on `http://localhost:5173/` (or similar).

### 4. Build for Production
To build the client application for production:
```bash
npm run build
```
To start the production server:
```bash
npm run start
```

### 5. Building the Desktop App (Electron)
To build the standalone macOS Electron desktop application:
```bash
npm run electron:build
npx electron-builder --mac
```

> **Note on Native Dependencies:** When switching between running the local Node.js development server and building the Electron app, you might encounter an ABI mismatch error for `better-sqlite3`. 
> - Run `npm rebuild` in the `server` directory when returning to local web development.
> - Run `npx electron-builder install-app-deps` in the root directory when preparing to build the Electron app.

## To bypass MacOS security for running the Electron app locally:
1. Open the Terminal and navigate to the directory where the Electron app is located.
2. Run the following command to allow the app to run:
```bash
xattr -d com.apple.quarantine LexLedger.app
```
or, if you want to recursively remove the quarantine attribute from all files within the app bundle:
```bash
xattr -cr /Applications/LexLedger.app
```

## Future Work

*Add any future enhancements, bug fixes, or upcoming features below.*

- Mail and reminders support
- Windows support
