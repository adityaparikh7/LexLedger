import ExcelJS from 'exceljs';

interface Invoice {
  invoice_number: string;
  date: string;
  date_paid: string | null;
  client_name: string;
  client_email: string | null;
  client_address: string | null;
  case_name: string | null;
  case_party1_type: string | null;
  case_plaintiff: string | null;
  case_party2_type: string | null;
  case_defendant: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  status: string;
}

interface LineItem {
  description: string;
  hours: number;
  rate: number;
  amount: number;
}

export async function generateExcel(invoice: Invoice, lineItems: LineItem[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LegalBill';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Memo of Fees', {
    properties: { defaultColWidth: 18 },
  });

  // Three columns: Sr.No | Particulars | INR
  sheet.columns = [
    { width: 8 },   // A - Sr.No
    { width: 55 },  // B - Particulars
    { width: 18 },  // C - INR
  ];

  const COLS = 3; // A:C
  const merge = (rowNum: number) => sheet.mergeCells(`A${rowNum}:C${rowNum}`);
  const mergeAB = (rowNum: number) => sheet.mergeCells(`A${rowNum}:B${rowNum}`);

  const bodyFont = { name: 'Times New Roman', size: 12, color: { argb: 'FF000000' } };
  const boldFont = { ...bodyFont, bold: true };

  // Helper to add a row with optional font + alignment
  const addRow = (values: (string | number | null)[], font?: Partial<ExcelJS.Font>, align?: Partial<ExcelJS.Alignment>) => {
    const row = sheet.addRow(values);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { ...bodyFont, ...font } as ExcelJS.Font;
      if (align) cell.alignment = align as ExcelJS.Alignment;
    });
    return row;
  };

  // ── HEADER ──
  const r1 = addRow(['Advocate Sandeep H. Parikh', null, null], boldFont);
  merge(r1.number);
  r1.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  const r2 = addRow(['11/E, Examiner Press Building, Dalal Street, Fort, Mumbai - 400 001.', null, null]);
  merge(r2.number);

  const r3 = addRow(['(M) +91 9820122460, E-mail : adv.sparikh@gmail.com', null, null]);
  merge(r3.number);

  sheet.addRow([]);

  // ── TITLE ──
  const rTitle = addRow(['MEMO OF FEES', null, null], boldFont, { horizontal: 'center', vertical: 'middle' });
  merge(rTitle.number);
  rTitle.height = 22;

  sheet.addRow([]);

  // ── META BLOCK (To / Memo No side by side) ──
  const rTo = sheet.addRow(['To,', null, `Memo No. : ${invoice.invoice_number}`]);
  mergeAB(rTo.number);
  rTo.getCell(1).font = bodyFont as ExcelJS.Font;
  rTo.getCell(3).font = bodyFont as ExcelJS.Font;
  rTo.getCell(3).alignment = { horizontal: 'right' };

  const rClient = sheet.addRow([invoice.client_name, null, `Memo Date : ${invoice.date}`]);
  mergeAB(rClient.number);
  rClient.getCell(1).font = bodyFont as ExcelJS.Font;
  rClient.getCell(3).font = bodyFont as ExcelJS.Font;
  rClient.getCell(3).alignment = { horizontal: 'right' };

  sheet.addRow([]);

  // ── INTRO ──
  const rDear = addRow(['Dear Sir,', null, null]);
  merge(rDear.number);

  const rIntro = addRow(['Please make payment of my professional fees as per the details set out below:', null, null]);
  merge(rIntro.number);
  rIntro.getCell(1).alignment = { wrapText: true };

  sheet.addRow([]);

  // ── CASE BLOCK ──
  const hasCase = invoice.case_name || invoice.case_party1_type || invoice.case_party2_type;
  if (hasCase) {
    if (invoice.case_name) {
      const rCaseName = addRow([invoice.case_name, null, null], boldFont, { horizontal: 'center' });
      merge(rCaseName.number);
    }
    
    const hasParty1 = invoice.case_party1_type && invoice.case_party1_type !== 'None';
    const hasParty2 = invoice.case_party2_type && invoice.case_party2_type !== 'None';

    if (hasParty1) {
      const rP1 = addRow([`${invoice.case_plaintiff || ''}   …${invoice.case_party1_type}`, null, null], undefined, { horizontal: 'center' });
      merge(rP1.number);
    }
    if (hasParty1 && hasParty2) {
      const rVs = addRow(['vs', null, null], undefined, { horizontal: 'center' });
      merge(rVs.number);
    }
    if (hasParty2) {
      const rP2 = addRow([`${invoice.case_defendant || ''}   …${invoice.case_party2_type}`, null, null], undefined, { horizontal: 'center' });
      merge(rP2.number);
    }
    sheet.addRow([]);
  }

  // ── TABLE HEADER ──
  const headerRow = sheet.addRow(['Sr. No.', 'Particulars', 'INR']);
  headerRow.eachCell((cell) => {
    cell.font = { ...boldFont } as ExcelJS.Font;
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
    cell.alignment = { horizontal: Number(cell.col) === 3 ? 'right' : 'left', vertical: 'middle' };
  });
  headerRow.height = 20;

  // ── LINE ITEMS ──
  lineItems.forEach((item, i) => {
    const row = sheet.addRow([i + 1, item.description, item.amount]);
    row.getCell(1).font = bodyFont as ExcelJS.Font;
    row.getCell(2).font = bodyFont as ExcelJS.Font;
    row.getCell(3).font = bodyFont as ExcelJS.Font;
    row.getCell(3).numFmt = '#,##0';
    row.getCell(3).alignment = { horizontal: 'right' };
  });

  // ── TOTAL ROW ──
  const totalRow = sheet.addRow([null, 'Total', invoice.total]);
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { ...boldFont } as ExcelJS.Font;
    cell.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };
  });
  totalRow.getCell(3).numFmt = '#,##0';
  totalRow.getCell(3).alignment = { horizontal: 'right' };

  sheet.addRow([]);

  // ── BANK DETAILS ──
  const bankLines = [
    'Bank Account Name : Sandeep Parikh',
    'Bank Name : ICICI Bank, Prabhadevi Branch, Mumbai',
    'Account Number : 005701061521',
    'IFSC : ICICI0000057',
    'PAN No. : AFFPP 3549B',
  ];
  for (const line of bankLines) {
    const r = addRow([line, null, null]);
    merge(r.number);
  }

  sheet.addRow([]);

  // ── SIGNATURE ──
  const rRegards = addRow(['Regards,', null, null]);
  merge(rRegards.number);
  sheet.addRow([]);
  const rSig1 = addRow(['SParikh', null, null]);
  merge(rSig1.number);
  const rSig2 = addRow(['Sandeep H. Parikh, Advocate', null, null]);
  merge(rSig2.number);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}