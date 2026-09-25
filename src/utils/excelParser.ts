import * as XLSX from 'xlsx';
import { Contact, ValidatedImportRecord } from '../types';

export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
export const PHONE_REGEX = /^[=]?['"]?\+?[0-9\s\-().]{7,25}['"]?$/;

export interface ParseExcelResult {
  records: ValidatedImportRecord[];
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  existingDuplicateCount: number;
}

/**
 * Normalizes phone numbers by stripping formatting characters, Excel formula prefixes (= or ="), and ensuring E.164 format.
 * Supports Indian mobile numbers with country code =91, +91, or 91.
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';
  // Strip Excel formula equals sign (= or =" or =') and trailing quotes
  let cleaned = String(phone).trim().replace(/^=['"]?/, '').replace(/['"]$/, '');
  const hadPlus = cleaned.startsWith('+') || cleaned.startsWith('=+');

  // Strip all non-digit characters to defend against SQL/script injection or corrupt formatting
  const digitsOnly = cleaned.replace(/\D/g, '');

  if (!digitsOnly || digitsOnly.length < 7 || digitsOnly.length > 15) {
    return '';
  }

  // If already had a plus, format with plus
  if (hadPlus) {
    return '+' + digitsOnly;
  }

  // Indian numbers starting with 91 (12 digits, e.g., 919876543210)
  if (digitsOnly.startsWith('91') && digitsOnly.length === 12) {
    return '+' + digitsOnly;
  }

  // Indian numbers starting with leading 0 (11 digits, e.g., 09876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0') && /^[6-9]/.test(digitsOnly.slice(1))) {
    return '+91' + digitsOnly.slice(1);
  }

  // 10-digit number (default NANP +1)
  if (digitsOnly.length === 10) {
    return '+1' + digitsOnly;
  }

  // Other international numbers with country code without plus (11-15 digits)
  return '+' + digitsOnly;
}

/**
 * Validates an email address format
 */
export function validateEmail(email: string): boolean {
  if (!email) return false;
  return EMAIL_REGEX.test(normalizeEmail(email));
}

/**
 * Normalizes email address to lowercase
 */
export function normalizeEmail(email: string): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Validates a single row of imported contact data
 */
export function validateContactRow(
  name: string,
  email: string,
  phone: string,
  company?: string,
  tagsRaw?: string
): { isValid: boolean; errors: string[]; parsedTags: string[] } {
  const errors: string[] = [];
  const cleanName = (name || '').trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPhone = (phone || '').trim();

  if (!cleanName) {
    errors.push('Name is required');
  } else if (cleanName.length > 150) {
    errors.push('Name must not exceed 150 characters');
  }

  if (!cleanEmail) {
    errors.push('Email is required');
  } else if (!EMAIL_REGEX.test(cleanEmail)) {
    errors.push(`Invalid email format: "${cleanEmail}"`);
  } else if (cleanEmail.length > 200) {
    errors.push('Email must not exceed 200 characters');
  }

  if (!cleanPhone) {
    errors.push('Phone is required for SMS/WhatsApp messaging');
  } else if (!PHONE_REGEX.test(cleanPhone)) {
    errors.push(`Invalid phone format: "${cleanPhone}"`);
  }

  const parsedTags: string[] = [];
  if (tagsRaw) {
    const rawList = String(tagsRaw).split(/[,;|]/);
    for (const tag of rawList) {
      const trimmed = tag.trim();
      if (trimmed && !parsedTags.includes(trimmed)) {
        parsedTags.push(trimmed);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    parsedTags,
  };
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) file buffer or ArrayBuffer
 */
export async function parseExcelFile(
  fileData: ArrayBuffer | Uint8Array,
  existingContacts: Contact[] = []
): Promise<ParseExcelResult> {
  const workbook = XLSX.read(fileData, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('The uploaded Excel workbook contains no sheets.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  // Parse rows as raw JSON array of objects with headers
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
  });

  if (rawRows.length === 0) {
    throw new Error('The Excel worksheet is empty. Please ensure headers and data exist.');
  }

  const existingEmailSet = new Set(existingContacts.map((c) => normalizeEmail(c.email)));
  const existingPhoneSet = new Set(existingContacts.map((c) => normalizePhone(c.phone)));

  const seenEmailsInFile = new Map<string, number>(); // email -> first rowIndex
  const seenPhonesInFile = new Map<string, number>(); // phone -> first rowIndex

  const records: ValidatedImportRecord[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let existingDuplicateCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowIndex = i + 2; // Row number in Excel sheet (1-based, +1 header)

    // Match column headers case-insensitively
    let rawName = '';
    let rawEmail = '';
    let rawPhone = '';
    let rawCompany = '';
    let rawTags = '';

    for (const [key, val] of Object.entries(row)) {
      const normalizedKey = key.trim().toLowerCase();
      const stringVal = String(val ?? '').trim();
      if (normalizedKey === 'name' || normalizedKey === 'full name' || normalizedKey === 'contact name') {
        rawName = stringVal;
      } else if (normalizedKey === 'email' || normalizedKey === 'email address') {
        rawEmail = stringVal;
      } else if (normalizedKey === 'phone' || normalizedKey === 'mobile' || normalizedKey === 'whatsapp' || normalizedKey === 'phone number') {
        rawPhone = stringVal;
      } else if (normalizedKey === 'company' || normalizedKey === 'organization' || normalizedKey === 'business') {
        rawCompany = stringVal;
      } else if (normalizedKey === 'tags' || normalizedKey === 'tag' || normalizedKey === 'category' || normalizedKey === 'groups') {
        rawTags = stringVal;
      }
    }

    const { isValid: basicValid, errors, parsedTags } = validateContactRow(
      rawName,
      rawEmail,
      rawPhone,
      rawCompany,
      rawTags
    );

    const normEmail = normalizeEmail(rawEmail);
    const normPhone = normalizePhone(rawPhone);

    let isDuplicateInFile = false;
    let isExistingInDb = false;

    // Check duplicate email in this file
    if (normEmail) {
      if (seenEmailsInFile.has(normEmail)) {
        errors.push(`Duplicate email in file (first seen on row ${seenEmailsInFile.get(normEmail)})`);
        isDuplicateInFile = true;
      } else {
        seenEmailsInFile.set(normEmail, rowIndex);
      }
    }

    // Check duplicate phone in this file
    if (normPhone) {
      if (seenPhonesInFile.has(normPhone)) {
        errors.push(`Duplicate phone in file (first seen on row ${seenPhonesInFile.get(normPhone)})`);
        isDuplicateInFile = true;
      } else {
        seenPhonesInFile.set(normPhone, rowIndex);
      }
    }

    // Check against existing database
    if (normEmail && existingEmailSet.has(normEmail)) {
      errors.push(`Email already exists in Contacts database`);
      isExistingInDb = true;
    }
    if (normPhone && existingPhoneSet.has(normPhone)) {
      errors.push(`Phone already exists in Contacts database`);
      isExistingInDb = true;
    }

    if (isDuplicateInFile) duplicateCount++;
    if (isExistingInDb) existingDuplicateCount++;

    const finalIsValid = basicValid && !isDuplicateInFile && !isExistingInDb;

    if (finalIsValid) {
      validCount++;
    } else {
      invalidCount++;
    }

    records.push({
      rowIndex,
      data: {
        name: rawName,
        email: normEmail,
        phone: normPhone || rawPhone,
        company: rawCompany,
        tags: parsedTags,
      },
      isValid: finalIsValid,
      errors,
      isDuplicateInFile,
      isExistingInDb,
    });
  }

  return {
    records,
    validCount,
    invalidCount,
    duplicateCount,
    existingDuplicateCount,
  };
}

/**
 * Creates and downloads a starter sample Excel file with correct headers and dummy data
 */
export function downloadSampleExcelTemplate(): void {
  const sampleData = [
    {
      Name: 'Sarah Jenkins',
      Email: 'sarah.jenkins@acmecorp.com',
      Phone: '+14155552671',
      Company: 'Acme Corp',
      Tags: 'VIP, Enterprise, Monthly Newsletter',
    },
    {
      Name: 'Marcus Vance',
      Email: 'marcus.v@innovatetech.io',
      Phone: '+12125558902',
      Company: 'InnovateTech',
      Tags: 'Prospect, Product Updates',
    },
    {
      Name: 'Elena Rostova',
      Email: 'elena.rostova@globalventures.com',
      Phone: '+442079460192',
      Company: 'Global Ventures',
      Tags: 'Investor, Monthly Report, WhatsApp Opt-in',
    },
    {
      Name: 'David Chen',
      Email: 'david.chen@apexretail.org',
      Phone: '+16505553412',
      Company: 'Apex Retail',
      Tags: 'Retail, SMS Subscriber',
    },
    {
      Name: 'Amara Okafor',
      Email: 'amara.okafor@zenithcloud.net',
      Phone: '+2348035551234',
      Company: 'Zenith Cloud',
      Tags: 'Executive, Monthly Newsletter',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');

  // Generate buffer and trigger browser download
  XLSX.writeFile(workbook, 'contacts_import_template.xlsx');
}

/**
 * Export contacts list to an Excel file
 */
export function exportContactsToExcel(contacts: Contact[], fileName = 'contacts_export.xlsx'): void {
  const rows = contacts.map((c) => ({
    Name: c.name,
    Email: c.email,
    Phone: c.phone,
    Company: c.company || '',
    Tags: c.tags.join(', '),
    Status: c.status,
    Consent: c.consentGiven ? 'Yes' : 'No',
    Created: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
  XLSX.writeFile(workbook, fileName);
}
