import ExcelJS from 'exceljs';

interface ExportInvoice {
  id: number;
  invoice_number: string;
  date: string;
  date_paid: string | null;
  client_name: string;
  client_email: string | null;
  client_address: string | null;
  client_phone: string | null;
  case_name: string | null;
  case_party1_type: string | null;
  case_plaintiff: string | null;
  case_party2_type: string | null;
  case_defendant: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_received: number;
  tds_amount: number;
  status: string;
  line_items: { description: string; hours: number; rate: number; amount: number }[];
  payments: { date: string; amount_received: number; tds_amount: number }[];
}

export async function generateExportExcel(invoices: ExportInvoice[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LegalBill';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Invoice Records', {
    properties: { defaultColWidth: 18 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Define columns
  sheet.columns = [
    { header: 'Sr. No.', key: 'sr_no', width: 8 },
    { header: 'Invoice Number', key: 'invoice_number', width: 18 },
    { header: 'Date of Invoice', key: 'date', width: 16 },
    { header: 'Name of Client', key: 'client_name', width: 24 },
    { header: 'Client Details', key: 'client_details', width: 30 },
    { header: 'Name of Case', key: 'case_name', width: 24 },
    { header: 'Case Parties', key: 'case_parties', width: 30 },
    { header: 'Services Offered', key: 'services', width: 32 },
    { header: 'Amount Charged per Service', key: 'amount_per_service', width: 30 },
    { header: 'Total Charged', key: 'total_charged', width: 16 },
    { header: 'Payments Received', key: 'payments_received', width: 20 },
    { header: 'TDS Amount', key: 'tds_amount', width: 14 },
    { header: 'Total Amount Received', key: 'total_received', width: 20 },
    { header: 'Date of Final Payment', key: 'date_final_payment', width: 20 },
  ];

  // Style the header row
  const headerRow = sheet.getRow(1);
  const headerFont: Partial<ExcelJS.Font> = {
    name: 'Inter',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  const headerFill: ExcelJS.FillPattern = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2E5E4E' },
  };
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = headerFont as ExcelJS.Font;
    cell.fill = headerFill;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF1a3d30' } },
    };
  });
  headerRow.height = 32;

  // Body font
  const bodyFont: Partial<ExcelJS.Font> = {
    name: 'Inter',
    size: 10,
    color: { argb: 'FF4A4A4A' },
  };

  const currencyFmt = '₹#,##0.00';

  // Add data rows
  invoices.forEach((inv, index) => {
    // Build client details string
    const clientDetailsParts: string[] = [];
    if (inv.client_email) clientDetailsParts.push(inv.client_email);
    if (inv.client_phone) clientDetailsParts.push(inv.client_phone);
    if (inv.client_address) clientDetailsParts.push(inv.client_address);
    const clientDetails = clientDetailsParts.join('\n') || '—';

    // Build case parties string
    const partiesParts: string[] = [];
    if (inv.case_party1_type && inv.case_party1_type !== 'None') {
      partiesParts.push(`${inv.case_plaintiff || ''} (${inv.case_party1_type})`);
    }
    if (inv.case_party2_type && inv.case_party2_type !== 'None') {
      partiesParts.push(`${inv.case_defendant || ''} (${inv.case_party2_type})`);
    }
    const caseParties = partiesParts.join(' vs ') || '—';

    // Build services and amounts strings
    const services = inv.line_items.map(li => li.description).join('\n') || '—';
    const amountsPerService = inv.line_items.map(li => `₹${li.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`).join('\n') || '—';

    // Payment details
    const totalReceived = inv.payments.reduce((sum, p) => sum + (p.amount_received || 0), 0);
    const totalTds = inv.payments.reduce((sum, p) => sum + (p.tds_amount || 0), 0);

    // Build payments received detail string
    const paymentsReceived = inv.payments.length > 0
      ? inv.payments.map(p => {
          const d = formatDateForExcel(p.date);
          return `${d}: ₹${p.amount_received.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        }).join('\n')
      : '—';

    // Date of final payment
    const lastPayment = inv.payments.length > 0
      ? inv.payments.sort((a, b) => b.date.localeCompare(a.date))[0]
      : null;
    const dateFinalPayment = lastPayment ? formatDateForExcel(lastPayment.date) : (inv.date_paid ? formatDateForExcel(inv.date_paid) : '—');

    const row = sheet.addRow({
      sr_no: index + 1,
      invoice_number: inv.invoice_number,
      date: formatDateForExcel(inv.date),
      client_name: inv.client_name,
      client_details: clientDetails,
      case_name: inv.case_name || '—',
      case_parties: caseParties,
      services: services,
      amount_per_service: amountsPerService,
      total_charged: inv.total,
      payments_received: paymentsReceived,
      tds_amount: totalTds,
      total_received: totalReceived,
      date_final_payment: dateFinalPayment,
    });

    // Style data cells
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = bodyFont as ExcelJS.Font;
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFd0d0d0' } },
      };
    });

    // Currency format for specific columns
    row.getCell('total_charged').numFmt = currencyFmt;
    row.getCell('tds_amount').numFmt = currencyFmt;
    row.getCell('total_received').numFmt = currencyFmt;

    // Center serial number
    row.getCell('sr_no').alignment = { horizontal: 'center', vertical: 'top' };

    // Right-align currency columns
    row.getCell('total_charged').alignment = { horizontal: 'right', vertical: 'top' };
    row.getCell('tds_amount').alignment = { horizontal: 'right', vertical: 'top' };
    row.getCell('total_received').alignment = { horizontal: 'right', vertical: 'top' };

    // Apply alternating row colors
    if (index % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' },
        };
      });
    }
  });

  // Add summary row at the bottom
  if (invoices.length > 0) {
    const emptyRow = sheet.addRow([]);
    const summaryRow = sheet.addRow({
      sr_no: null,
      invoice_number: null,
      date: null,
      client_name: null,
      client_details: null,
      case_name: null,
      case_parties: null,
      services: null,
      amount_per_service: 'TOTALS',
      total_charged: invoices.reduce((sum, inv) => sum + inv.total, 0),
      payments_received: null,
      tds_amount: invoices.reduce((sum, inv) => sum + inv.payments.reduce((s, p) => s + (p.tds_amount || 0), 0), 0),
      total_received: invoices.reduce((sum, inv) => sum + inv.payments.reduce((s, p) => s + (p.amount_received || 0), 0), 0),
      date_final_payment: null,
    });

    summaryRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Inter', size: 11, bold: true, color: { argb: 'FF2E5E4E' } } as ExcelJS.Font;
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF2E5E4E' } },
        bottom: { style: 'medium', color: { argb: 'FF2E5E4E' } },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFe8f0ed' },
      };
    });
    summaryRow.getCell('total_charged').numFmt = currencyFmt;
    summaryRow.getCell('tds_amount').numFmt = currencyFmt;
    summaryRow.getCell('total_received').numFmt = currencyFmt;
    summaryRow.getCell('total_charged').alignment = { horizontal: 'right', vertical: 'middle' };
    summaryRow.getCell('tds_amount').alignment = { horizontal: 'right', vertical: 'middle' };
    summaryRow.getCell('total_received').alignment = { horizontal: 'right', vertical: 'middle' };
    summaryRow.getCell('amount_per_service').alignment = { horizontal: 'right', vertical: 'middle' };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function formatDateForExcel(dateStr: string): string {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('T')[0].split('-');
  if (year && month && day) return `${day}/${month}/${year}`;
  return dateStr;
}
