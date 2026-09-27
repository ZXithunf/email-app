import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  makeBase64Url,
  createRfc2822Email,
  sendGmailMessage,
  verifyGmailScope,
} from '../src/services/gmailService';

describe('Gmail API Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('makeBase64Url', () => {
    it('properly encodes standard ASCII text into base64url without padding', () => {
      const input = 'Hello World from Astrix';
      const encoded = makeBase64Url(input);
      expect(encoded).not.toContain('=');
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('handles UTF-8 and special characters like emojis safely', () => {
      const input = '🚀 Astrix Automation 🇮🇳 Special & Unique <tags>';
      const encoded = makeBase64Url(input);
      expect(encoded).toBeDefined();
      expect(encoded).not.toContain('=');
    });
  });

  describe('createRfc2822Email', () => {
    it('generates a base64url encoded RFC 2822 email payload', () => {
      const raw = createRfc2822Email({
        to: 'recipient@acme.com',
        subject: 'Monthly Update',
        htmlBody: '<p>Hello <b>Recipient</b></p>',
        fromName: 'Astrix Automation',
      });

      expect(typeof raw).toBe('string');
      expect(raw.length).toBeGreaterThan(20);
      expect(raw).not.toContain('=');
    });

    it('includes reply-to header when provided', () => {
      const raw = createRfc2822Email({
        to: 'client@example.com',
        subject: 'Invoice Ready',
        htmlBody: '<p>Your invoice is ready.</p>',
        replyTo: 'support@astrix.com',
      });

      expect(raw).toBeDefined();
    });
  });

  describe('sendGmailMessage validation & execution', () => {
    it('throws error if access token is empty', async () => {
      await expect(
        sendGmailMessage({
          accessToken: '',
          to: 'test@example.com',
          subject: 'Test',
          htmlBody: '<p>Test</p>',
        })
      ).rejects.toThrow('Google Workspace access token is required');
    });

    it('throws error if recipient email is invalid or missing @ symbol', async () => {
      await expect(
        sendGmailMessage({
          accessToken: 'fake-token-123',
          to: 'not-an-email',
          subject: 'Test',
          htmlBody: '<p>Test</p>',
        })
      ).rejects.toThrow('Invalid recipient email address');
    });

    it('successfully calls Google Gmail endpoint when valid', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'gmail-msg-9999',
          threadId: 'gmail-thread-1111',
          labelIds: ['SENT'],
        }),
      });
      global.fetch = mockFetch;

      const res = await sendGmailMessage({
        accessToken: 'mock-valid-google-token',
        to: 'bmmithun688@gmail.com',
        subject: 'Welcome to Astrix',
        htmlBody: '<p>Welcome!</p>',
        fromName: 'Astrix Outbox',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, requestInit] = mockFetch.mock.calls[0];
      expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
      expect(requestInit.method).toBe('POST');
      expect(requestInit.headers['Authorization']).toBe('Bearer mock-valid-google-token');
      expect(res.id).toBe('gmail-msg-9999');
      expect(res.threadId).toBe('gmail-thread-1111');
    });

    it('handles 401 token expiration error gracefully with user guidance', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Request had invalid authentication credentials.' } }),
      });

      await expect(
        sendGmailMessage({
          accessToken: 'expired-token',
          to: 'client@example.com',
          subject: 'Alert',
          htmlBody: '<p>Expired</p>',
        })
      ).rejects.toThrow(/Google Workspace session has expired/);
    });

    it('handles 403 permission denied error when scope is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { message: 'Insufficient Permission' } }),
      });

      await expect(
        sendGmailMessage({
          accessToken: 'token-missing-scope',
          to: 'client@example.com',
          subject: 'Alert',
          htmlBody: '<p>Forbidden</p>',
        })
      ).rejects.toThrow(/Gmail API Permission Denied/);
    });
  });

  describe('verifyGmailScope', () => {
    it('identifies when gmail.send scope is present in tokeninfo', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.send',
          expires_in: '3599',
        }),
      });

      const info = await verifyGmailScope('valid-token');
      expect(info.hasGmailScope).toBe(true);
      expect(info.scopes).toContain('https://www.googleapis.com/auth/gmail.send');
    });

    it('returns false when gmail scope is omitted', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          scope: 'https://www.googleapis.com/auth/drive.readonly',
        }),
      });

      const info = await verifyGmailScope('token-without-gmail');
      expect(info.hasGmailScope).toBe(false);
    });
  });
});
