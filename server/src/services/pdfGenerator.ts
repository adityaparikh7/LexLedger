import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { getFirmProfile } from '../routes/settings';

/** Normalise any stored date string to dd/mm/yyyy */
function formatDate(raw: string | null | undefined): string {
  if (!raw) return '';
  // Already dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  // ISO: yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [y, m, d] = raw.split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  }
  // Fallback: let Date parse it
  const dt = new Date(raw);
  if (!isNaN(dt.getTime())) {
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return raw;
}

const TEMPLATE_PATH = path.join(__dirname, 'memo-template.html');

/** Escape HTML special characters to prevent XSS */
function escapeHTML(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function generatePDF(invoice: any, lineItems: any[]): Promise<Buffer> {
  // Read and populate the HTML template
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Get firm profile for dynamic details
  const profile = getFirmProfile();

  // Build firm contact line
  const contactParts: string[] = [];
  if (profile.firm_phone) contactParts.push(`(M) ${escapeHTML(profile.firm_phone)}`);
  if (profile.firm_email) contactParts.push(`E-mail : ${escapeHTML(profile.firm_email)}`);
  const firmContact = contactParts.join(', ');

  // Build bank details HTML
  const bankLines: string[] = [];
  if (profile.bank_account_name) bankLines.push(`Bank Account Name : ${escapeHTML(profile.bank_account_name)}`);
  if (profile.bank_name) bankLines.push(`Bank Name : ${escapeHTML(profile.bank_name)}`);
  if (profile.bank_account_number) bankLines.push(`Account Number : ${escapeHTML(profile.bank_account_number)}`);
  if (profile.bank_ifsc) bankLines.push(`IFSC : ${escapeHTML(profile.bank_ifsc)}`);
  if (profile.pan_number) bankLines.push(`PAN No. : ${escapeHTML(profile.pan_number)}`);
  const bankDetailsHtml = bankLines.join('<br/>');

  // Build line item rows
  const lineItemsHtml = lineItems
    .map(
      (item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(item.description)}</td>
        <td class="amount">${formatINR(item.amount)}</td>
      </tr>`
    )
    .join('');

  // Build case parties html
  let casePartiesHtml = '';
  const hasParty1 = invoice.case_party1_type && invoice.case_party1_type !== 'None';
  const hasParty2 = invoice.case_party2_type && invoice.case_party2_type !== 'None';

  if (hasParty1 && hasParty2) {
    casePartiesHtml = `${escapeHTML(invoice.case_plaintiff ?? '')} …${escapeHTML(invoice.case_party1_type)}<br/>vs<br/>${escapeHTML(invoice.case_defendant ?? '')} …${escapeHTML(invoice.case_party2_type)}<br/>`;
  } else if (hasParty1) {
    casePartiesHtml = `${escapeHTML(invoice.case_plaintiff ?? '')} …${escapeHTML(invoice.case_party1_type)}<br/>`;
  } else if (hasParty2) {
    casePartiesHtml = `${escapeHTML(invoice.case_defendant ?? '')} …${escapeHTML(invoice.case_party2_type)}<br/>`;
  }

  // Replace placeholders
  html = html
    .replace('{{firm_name}}', escapeHTML(profile.firm_name))
    .replace('{{firm_address}}', escapeHTML(profile.firm_address))
    .replace('{{firm_contact}}', firmContact) // Already escaped in its parts
    .replace('{{bank_details}}', bankDetailsHtml) // Already escaped in its parts
    .replace('{{signature_name}}', escapeHTML(profile.signature_name))
    .replace('{{signature_full}}', escapeHTML(profile.signature_full))
    .replace('{{client_name}}', escapeHTML(invoice.client_name ?? ''))
    .replace('{{invoice_number}}', escapeHTML(invoice.invoice_number ?? ''))
    .replace('{{date}}', formatDate(invoice.date)) // Already formatted date, safe
    .replace('{{case_name}}', escapeHTML(invoice.case_name ?? ''))
    .replace('{{case_parties}}', casePartiesHtml) // Already escaped in its parts
    .replace('{{line_items}}', lineItemsHtml) // Already escaped in its parts
    .replace('{{total}}', formatINR(invoice.total ?? 0)); // Formatted number, safe

  // Launch Puppeteer and render HTML to PDF
  const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  // In packaged Electron app, use the bundled Chrome executable
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

function formatINR(n: number): string {
  return n.toLocaleString('en-IN');
}