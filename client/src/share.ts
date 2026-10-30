import type { ComposeRequest } from './api';

/** Compose URL for the user's chosen mail client. Desktop mail apps (Apple Mail, Outlook)
 *  can't be scripted from a browser, so those use mailto:, which opens the default mail app. */
function composeUrl({ to, subject, body, emailClient }: ComposeRequest): string {
  const t = encodeURIComponent(to);
  const s = encodeURIComponent(subject);
  const b = encodeURIComponent(body);
  switch (emailClient) {
    case 'gmail_web':
      return `https://mail.google.com/mail/?view=cm&to=${t}&su=${s}&body=${b}`;
    case 'outlook_web':
      return `https://outlook.office.com/mail/deeplink/compose?to=${t}&subject=${s}&body=${b}`;
    default:
      return `mailto:${t}?subject=${s}&body=${b}`;
  }
}

/** Open a new email on this device. Returns true when it opened in a browser tab (web mail). */
export function openCompose(request: ComposeRequest): boolean {
  const url = composeUrl(request);
  if (url.startsWith('mailto:')) {
    window.location.href = url;
    return false;
  }
  window.open(url, '_blank', 'noopener');
  return true;
}

/** True on phones and tablets that can hand a PDF to the system share sheet (Mail, Gmail,
 *  WhatsApp…), attaching it directly. Desktops keep the user's chosen mail client. */
export function canShareFiles(): boolean {
  if (!window.matchMedia('(pointer: coarse)').matches || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([''], 'memo.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

/** Open the share sheet with the file. Must run in a tap handler (browsers require a user
 *  gesture). Returns false if the user closed the sheet without sharing. */
export async function shareFile(file: File, title: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title, text });
    return true;
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') return false;
    throw err;
  }
}
