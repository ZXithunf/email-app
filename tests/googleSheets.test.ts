import { describe, it, expect } from 'vitest';
import {
  extractSpreadsheetId,
  parseSheetRowsToContacts,
} from '../src/services/googleSheetsService';
import { Contact } from '../src/types';

describe('Google Sheets Service & Parser Unit Tests', () => {
  it('extracts spreadsheet ID from various URL formats and plain IDs', () => {
    expect(
      extractSpreadsheetId(
        'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'
      )
    ).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');

    expect(
      extractSpreadsheetId(
        'https://docs.google.com/spreadsheets/d/abc-123_XYZ/'
      )
    ).toBe('abc-123_XYZ');

    expect(extractSpreadsheetId('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')).toBe(
      '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
    );
  });

  it('correctly maps headers and validates contacts from Google Sheet 2D array', () => {
    const rows = [
      ['Full Name', 'Email Address', 'Phone Number', 'Company', 'Tags'],
      ['Sarah Connor', 'sarah@resistance.org', '+14155550199', 'Resistance', 'VIP, Active'],
      ['John Connor', 'bad-email-format', '+14155550188', 'Resistance', 'Prospect'],
      ['Duplicate Sarah', 'sarah@resistance.org', '+14155550177', 'Resistance', 'VIP'],
    ];

    const existingContacts: Contact[] = [];
    const preview = parseSheetRowsToContacts(rows, existingContacts);

    expect(preview.totalRows).toBe(3);
    expect(preview.validCount).toBe(1); // Row 1 is valid
    expect(preview.invalidCount).toBe(2);

    // Row 1
    expect(preview.records[0].isValid).toBe(true);
    expect(preview.records[0].data.name).toBe('Sarah Connor');
    expect(preview.records[0].data.email).toBe('sarah@resistance.org');
    expect(preview.records[0].data.phone).toBe('+14155550199');
    expect(preview.records[0].data.tags).toEqual(['VIP', 'Active']);

    // Row 2 has bad email
    expect(preview.records[1].isValid).toBe(false);
    expect(preview.records[1].errors.some((e) => e.includes('Invalid email'))).toBe(true);

    // Row 3 has duplicate email within sheet
    expect(preview.records[2].isValid).toBe(false);
    expect(preview.records[2].errors.some((e) => e.includes('Duplicate email in Google Sheet'))).toBe(
      true
    );
  });

  it('identifies duplicates that already exist in platform database', () => {
    const existingContacts: Contact[] = [
      {
        id: 'c1',
        name: 'Existing Member',
        email: 'member@company.com',
        phone: '+15551234567',
        tags: ['Client'],
        status: 'subscribed',
        consentGiven: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const rows = [
      ['Name', 'Email', 'Phone', 'Company', 'Tags'],
      ['New Person', 'member@company.com', '+14155559999', 'Acme', 'VIP'],
    ];

    const preview = parseSheetRowsToContacts(rows, existingContacts);
    expect(preview.records[0].isValid).toBe(false);
    expect(
      preview.records[0].errors.some((e) => e.includes('already exists in platform contacts'))
    ).toBe(true);
  });
});
