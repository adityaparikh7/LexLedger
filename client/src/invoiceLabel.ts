/** How to show an invoice's number. An invoice created offline has none until it syncs. */
export const invoiceLabel = (inv: { invoice_number: string | null }) => inv.invoice_number ?? 'Number on sync';
