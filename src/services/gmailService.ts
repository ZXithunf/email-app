/**
 * Gmail API Service
 * Handles RFC 2822 MIME message formatting, base64url encoding,
 * user profile retrieval, and reliable dispatch via Gmail v1 REST API.
 */

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailSendResult {
  id: string;
  threadId: string;
  labelIds?: string[];
}

export interface SendGmailOptions {
  accessToken: string;
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
  replyTo?: string;
}

/**
 * Encodes a string into RFC 4648 Base64URL without padding, UTF-8 compliant.
 */
export function makeBase64Url(str: string): string {
  // UTF-8 encode string to byte array
  const utf8Bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Builds a MIME compliant RFC 2822 raw message with UTF-8 support
 */
export function createRfc2822Email({
  to,
  subject,
  htmlBody,
  fromName,
  replyTo,
}: {
  to: string;
  subject: string;
  htmlBody: string;
  fromName?: string;
  replyTo?: string;
}): string {
  // Safe B-encoded UTF-8 subject header
  const subjectBytes = new TextEncoder().encode(subject);
  let subjectBinary = '';
  for (let i = 0; i < subjectBytes.length; i++) {
    subjectBinary += String.fromCharCode(subjectBytes[i]);
  }
  const encodedSubject = `=?UTF-8?B?${btoa(subjectBinary)}?=`;

  const headers: string[] = [
    fromName ? `From: =?UTF-8?B?${btoa(new TextEncoder().encode(fromName).reduce((acc, byte) => acc + String.fromCharCode(byte), ''))}?= <me>` : 'From: me',
    `To: ${to.trim()}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];

  if (replyTo) {
    headers.push(`Reply-To: ${replyTo.trim()}`);
  }

  // Base64 encode the HTML body for bulletproof transport
  const bodyBytes = new TextEncoder().encode(htmlBody);
  let bodyBinary = '';
  for (let i = 0; i < bodyBytes.length; i++) {
    bodyBinary += String.fromCharCode(bodyBytes[i]);
  }
  const encodedBody = btoa(bodyBinary);

  const rawMessage = `${headers.join('\r\n')}\r\n\r\n${encodedBody}`;
  return makeBase64Url(rawMessage);
}

/**
 * Fetches the authenticated user's Gmail profile
 */
export async function getGmailUserProfile(accessToken: string): Promise<GmailProfile> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message || `Failed to fetch Gmail profile (HTTP ${res.status})`
    );
  }

  return await res.json();
}

/**
 * Checks token info to verify if gmail.send or relevant scopes are active
 */
export async function verifyGmailScope(accessToken: string): Promise<{
  hasGmailScope: boolean;
  scopes: string[];
  expiresIn?: number;
}> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
    if (!res.ok) {
      return { hasGmailScope: false, scopes: [] };
    }
    const data = await res.json();
    const scopes: string[] = (data.scope || '').split(' ');
    const hasGmailScope = scopes.some(
      (s) =>
        s.includes('mail.google.com') ||
        s.includes('gmail.send') ||
        s.includes('gmail.compose') ||
        s.includes('gmail.modify')
    );
    return {
      hasGmailScope,
      scopes,
      expiresIn: data.expires_in ? parseInt(data.expires_in, 10) : undefined,
    };
  } catch (err) {
    return { hasGmailScope: false, scopes: [] };
  }
}

/**
 * Dispatches an email via the Gmail v1 REST API
 */
export async function sendGmailMessage(options: SendGmailOptions): Promise<GmailSendResult> {
  const { accessToken, to, subject, htmlBody, fromName, replyTo } = options;

  if (!accessToken) {
    throw new Error('Google Workspace access token is required to send via Gmail API.');
  }

  if (!to || !to.includes('@')) {
    throw new Error(`Invalid recipient email address: "${to}"`);
  }

  const raw = createRfc2822Email({
    to,
    subject: subject || 'Notice from Astrix',
    htmlBody: htmlBody || '<p>(No content)</p>',
    fromName,
    replyTo,
  });

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const errorMessage =
      errorBody?.error?.message ||
      `Gmail API returned HTTP ${res.status}: ${res.statusText}`;

    if (res.status === 401) {
      throw new Error(
        'Your Google Workspace session has expired. Please sign in with Google again to refresh permissions.'
      );
    }

    if (res.status === 403) {
      throw new Error(
        `Gmail API Permission Denied: ${errorMessage}. Please ensure the "https://www.googleapis.com/auth/gmail.send" scope is granted.`
      );
    }

    throw new Error(errorMessage);
  }

  const data: GmailSendResult = await res.json();
  return data;
}
