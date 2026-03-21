import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

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

export async function generatePDF(invoice: any, lineItems: any[]): Promise<Buffer> {
  // Read and populate the HTML template
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Build line item rows
  const lineItemsHtml = lineItems
    .map(
      (item, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${item.description}</td>
        <td class="amount">${formatINR(item.amount)}</td>
      </tr>`
    )
    .join('');

  // Replace placeholders
  html = html
    .replace('{{client_name}}', invoice.client_name ?? '')
    .replace('{{invoice_number}}', invoice.invoice_number ?? '')
    .replace('{{date}}', formatDate(invoice.date))
    .replace('{{case_name}}', invoice.case_name ?? '')
    .replace('{{case_plaintiff}}', invoice.case_plaintiff ?? '')
    .replace('{{party1}}', invoice.case_party1_type ?? 'Plaintiff')
    .replace('{{case_defendant}}', invoice.case_defendant ?? '')
    .replace('{{party2}}', invoice.case_party2_type ?? 'Defendant')
    .replace('{{line_items}}', lineItemsHtml)
    .replace('{{total}}', formatINR(invoice.total ?? 0));

  // Launch Puppeteer and render HTML to PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

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