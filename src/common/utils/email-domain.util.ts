import { resolveMx } from 'node:dns/promises';

// Domains with no MX records can't receive mail at all — this catches typos
// and made-up domains (e.g. "jane@123.com") without needing to actually send
// an email. It can't confirm the specific mailbox exists, only that the
// domain is configured to receive mail.
export async function domainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;

  try {
    const records = await resolveMx(domain);
    return records.length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return false;
    }
    // Unexpected resolver/network error on our end — don't block account
    // creation over a transient DNS hiccup.
    return true;
  }
}
