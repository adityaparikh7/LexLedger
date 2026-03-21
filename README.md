# LegalBill (LexLedger)

LegalBill is a full-stack legal invoicing and billing management application designed to streamline client and invoice tracking. The application provides an intuitive dashboard, client management, and detailed invoice generation features. It can automatically generate invoices in PDF and Excel formats and includes email capabilities.

## Features
- **Dashboard**: Track overall revenue, outstanding invoices, and billing metrics.
- **Client Management**: Add and manage client details.
- **Invoice Generation**: Create, view, and manage invoices natively.
- **Export Options**: Export invoices to beautifully formatted PDFs and Excel spreadsheets.
- **Email Service**: Send invoices and memos securely via email.

## Tech Stack
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

---

## Future Work

*Add any future enhancements, bug fixes, or upcoming features below.*

- [ ] 
- [ ] 
- [ ] 
