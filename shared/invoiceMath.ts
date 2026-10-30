// Invoice arithmetic shared by the client and the cloud server, so an invoice
// edited offline shows the same totals the server will store.

export interface LineItemInput {
  hours?: number | null;
  rate?: number | null;
}

export interface PaymentInput {
  date: string;
  amount_received?: number | null;
  tds_amount?: number | null;
}

/** Round to paise; the database stores money as numeric(14,2). */
export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** hours × rate, or a flat fee (rate alone) when no hours are entered. */
export function lineItemAmount(item: LineItemInput): number {
  const hours = Number(item.hours) || 0;
  const rate = Number(item.rate) || 0;
  const amount = hours * rate;
  return roundMoney(amount === 0 && rate ? rate : amount);
}

export function computeInvoiceTotals(items: LineItemInput[], taxRate: number) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + lineItemAmount(item), 0));
  const tax_amount = roundMoney(subtotal * ((Number(taxRate) || 0) / 100));
  return { subtotal, tax_amount, total: roundMoney(subtotal + tax_amount) };
}

/** Invoice-level payment fields derived from its payment entries. */
export function paymentAggregates(payments: PaymentInput[]) {
  const amount_received = roundMoney(payments.reduce((sum, p) => sum + (Number(p.amount_received) || 0), 0));
  const tds_amount = roundMoney(payments.reduce((sum, p) => sum + (Number(p.tds_amount) || 0), 0));
  const latest = payments.reduce<string | null>((max, p) => (max === null || p.date > max ? p.date : max), null);
  return { amount_received, tds_amount, date_paid: latest };
}
