import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseExcelFile, validateEmail, normalizePhone } from '../src/utils/excelParser';
import { Contact } from '../src/types';

describe('Excel Parser & Validation Unit Tests', () => {
  it('correctly validates emails', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name+tag@sub.domain.org')).toBe(true);
    expect(validateEmail('invalid-email')).toBe(false);
    expect(validateEmail('missing@domain')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });

  it('normalizes phone numbers to standard format', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('5551234567')).toBe('+15551234567');

    // Indian phone numbers
    expect(normalizePhone('+919876543210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('=919876543210')).toBe('+919876543210');
    expect(normalizePhone('="919876543210"')).toBe('+919876543210');
    expect(normalizePhone('=+919876543210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
  });

  it('parses valid and invalid Excel rows with duplicate detection', async () => {
    // Create an in-memory workbook
    const data = [
      {
        Name: 'Alice Smith',
        Email: 'alice@company.com',
        Phone: '+14155550101',
        Company: 'Alice Inc',
        Tags: 'VIP, Client',
      },
      {
        Name: 'Bob Jones',
        Email: 'invalid-email-address',
        Phone: '+14155550102',
        Company: 'Bob Corp',
        Tags: 'Prospect',
      },
      {
        Name: 'Duplicate Alice',
        Email: 'alice@company.com', // Duplicate email in file
        Phone: '+14155550103',
        Company: 'Alice Inc',
        Tags: 'VIP',
      },
      {
        Name: 'Charlie Brown',
        Email: 'charlie@company.com',
        Phone: '+14155550101', // Duplicate phone in file
        Company: 'Peanuts',
        Tags: 'Partner',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const existingContacts: Contact[] = [];
    const result = await parseExcelFile(buffer, existingContacts);

    expect(result.records.length).toBe(4);
    // Row 1 (Alice) is valid
    expect(result.records[0].isValid).toBe(true);
    // Row 2 (Bob) has invalid email
    expect(result.records[1].isValid).toBe(false);
    expect(result.records[1].errors.some((e) => e.includes('Invalid email'))).toBe(true);
    // Row 3 has duplicate email in file
    expect(result.records[2].isValid).toBe(false);
    expect(result.records[2].errors.some((e) => e.includes('Duplicate email in file'))).toBe(true);
    // Row 4 has duplicate phone in file
    expect(result.records[3].isValid).toBe(false);
    expect(result.records[3].errors.some((e) => e.includes('Duplicate phone in file'))).toBe(true);

    expect(result.validCount).toBe(1);
    expect(result.invalidCount).toBe(3);
  });
});
