/** Firm details printed on fee memos (PDF and Excel). Both servers pass their firm profile in. */
export interface MemoProfile {
  firm_name: string;
  firm_address: string;
  firm_phone: string;
  firm_email: string;
  bank_account_name: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  pan_number: string;
  signature_name: string;
  signature_full: string;
}
