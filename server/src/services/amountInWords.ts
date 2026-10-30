const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0-99 in words ('' for 0) */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const unit = n % 10;
  return unit ? `${TENS[Math.floor(n / 10)]} ${ONES[unit]}` : TENS[Math.floor(n / 10)];
}

/** 0-999 in words ('' for 0) */
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = twoDigits(n % 100);
  if (!hundreds) return rest;
  return rest ? `${ONES[hundreds]} Hundred ${rest}` : `${ONES[hundreds]} Hundred`;
}

/** Whole number in words using Indian grouping (crore, lakh, thousand) */
function integerToWords(n: number): string {
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  // 100 crore and above is expressed recursively, e.g. "One Hundred Fifty Crore"
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

/** e.g. 1234567.5 → "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  // Work in paise to avoid floating-point drift
  const totalPaise = Math.round(Math.abs(amount || 0) * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;
  const rupeeWords = rupees ? integerToWords(rupees) : 'Zero';
  const paiseWords = paise ? ` and ${twoDigits(paise)} Paise` : '';
  return `Rupees ${rupeeWords}${paiseWords} Only`;
}
