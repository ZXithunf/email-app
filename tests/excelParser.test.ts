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

  it('correctly handles First Name and Last Name columns split across headers', async () => {
    const data = [
      {
        'First Name': 'John',
        'Last Name': 'Doe',
        'Email Address': 'john.doe@enterprise.com',
        'Mobile Number': '+14155551234',
        'Company Name': 'Acme Global',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseExcelFile(buffer, []);
    expect(result.records.length).toBe(1);
    expect(result.validCount).toBe(1);
    expect(result.records[0].data.name).toBe('John Doe');
    expect(result.records[0].data.email).toBe('john.doe@enterprise.com');
  });

  it('allows valid email contacts even when phone is empty (email-only lists)', async () => {
    const data = [
      {
        Name: 'Email Only Subscriber',
        Email: 'subscriber@newsletter.org',
        Phone: '',
        Company: 'Media Corp',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Subscribers');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseExcelFile(buffer, []);
    expect(result.validCount).toBe(1);
    expect(result.records[0].isValid).toBe(true);
    expect(result.records[0].data.phone).toBe('');
  });

  it('handles phone numbers in scientific notation or float notation', () => {
    expect(normalizePhone('9.87654E+11')).toBe('+987654000000');
    expect(normalizePhone('9876543210.0')).toBe('+19876543210');
  });

  it('auto-detects varied column headers such as WhatsApp, Email ID, and Customer Name', async () => {
    const data = [
      {
        'Customer Name': 'Rohan Mehta',
        'Email ID': 'rohan.mehta@enterprise.in',
        'WhatsApp Number': '+91 98123 45678',
        'Firm Name': 'Mehta Logistics',
        'Category': 'VIP, North Region',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseExcelFile(buffer, []);
    expect(result.validCount).toBe(1);
    expect(result.records[0].data.name).toBe('Rohan Mehta');
    expect(result.records[0].data.email).toBe('rohan.mehta@enterprise.in');
    expect(result.records[0].data.phone).toBe('+919812345678');
    expect(result.records[0].data.company).toBe('Mehta Logistics');
    expect(result.records[0].data.tags).toContain('VIP');
  });

  it('supports phone-only contacts for WhatsApp campaigns with auto-assigned placeholder email', async () => {
    const data = [
      {
        'Name': 'Kavita Patel',
        'Email': '', // Empty email
        'Phone': '+919876543210',
        'Company': 'Patel Silks',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WhatsAppList');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseExcelFile(buffer, [], { allowPhoneOnly: true });
    expect(result.validCount).toBe(1);
    expect(result.records[0].isValid).toBe(true);
    expect(result.records[0].isPhoneOnly).toBe(true);
    expect(result.records[0].data.email).toContain('@contact.local');
    expect(result.records[0].data.phone).toBe('+919876543210');
  });

  it('derives human contact name from email when name column is blank', async () => {
    const data = [
      {
        'Name': '',
        'Email': 'rajesh.sharma@fintech.co',
        'Phone': '+919988776655',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    const result = await parseExcelFile(buffer, []);
    expect(result.validCount).toBe(1);
    expect(result.records[0].data.name).toBe('Rajesh Sharma');
  });

  it('honors interactive custom column mapping overrides', async () => {
    const data = [
      {
        'Col1': 'Custom Title',
        'Col2': 'Dr. Marcus Vance',
        'Col3': 'dr.marcus@clinic.org',
        'Col4': '+12125550199',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Custom');
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    // Manually map columns 1 -> Name, 2 -> Email, 3 -> Phone
    const result = await parseExcelFile(buffer, [], {
      columnMapping: {
        nameCol: 1,
        emailCol: 2,
        phoneCol: 3,
      },
    });

    expect(result.validCount).toBe(1);
    expect(result.records[0].data.name).toBe('Dr. Marcus Vance');
    expect(result.records[0].data.email).toBe('dr.marcus@clinic.org');
    expect(result.records[0].data.phone).toBe('+12125550199');
  });
});
