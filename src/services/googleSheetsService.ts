import { Contact, ValidatedImportRecord } from '../types';
import { EMAIL_REGEX, normalizeEmail, normalizePhone } from '../utils/excelParser';

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: {
    sheetId: number;
    title: string;
    rowCount?: number;
    columnCount?: number;
  }[];
}

export interface GoogleSheetsImportPreview {
  headers: string[];
  totalRows: number;
  validCount: number;
  invalidCount: number;
  records: ValidatedImportRecord[];
}

/**
 * Lists user spreadsheets from Google Drive
 */
export async function listUserGoogleSpreadsheets(accessToken: string): Promise<DriveSpreadsheetFile[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const fields = encodeURIComponent('files(id, name, modifiedTime, webViewLink, iconLink)');
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=30`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Failed to fetch Google Spreadsheets (HTTP ${res.status})`
    );
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Retrieves metadata for a specific spreadsheet including all sheet/tab names
 */
export async function getSpreadsheetDetails(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetMetadata> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title,gridProperties)`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Failed to fetch spreadsheet details for ID ${cleanId} (HTTP ${res.status})`
    );
  }

  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title || 'Sheet1',
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount,
    })),
  };
}

/**
 * Reads row values from a specific sheet tab
 */
export async function readSpreadsheetSheetValues(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  range?: string
): Promise<string[][]> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const targetRange = range ? `${sheetTitle}!${range}` : sheetTitle;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(targetRange)}?valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Failed to read sheet "${sheetTitle}" (HTTP ${res.status})`
    );
  }

  const data = await res.json();
  return data.values || [];
}

/**
 * Extracts spreadsheet ID if full URL was provided
 */
export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // Format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Parses 2D array of Google Sheet rows into validated contact records
 */
export function parseSheetRowsToContacts(
  rows: string[][],
  existingContacts: Contact[]
): GoogleSheetsImportPreview {
  if (!rows || rows.length < 2) {
    return {
      headers: [],
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      records: [],
    };
  }

  // Row 0 is header row
  const rawHeaders = rows[0].map((h) => (h ? String(h).trim() : ''));
  const headerMap: { [key: string]: number } = {};

  rawHeaders.forEach((header, index) => {
    const lower = header.toLowerCase();
    if (lower === 'name' || lower === 'full name' || lower === 'contact name') {
      headerMap['name'] = index;
    } else if (lower === 'email' || lower === 'email address' || lower === 'mail') {
      headerMap['email'] = index;
    } else if (lower === 'phone' || lower === 'phone number' || lower === 'mobile' || lower === 'cell') {
      headerMap['phone'] = index;
    } else if (lower === 'company' || lower === 'organization' || lower === 'business') {
      headerMap['company'] = index;
    } else if (lower === 'tags' || lower === 'tag' || lower === 'labels' || lower === 'group') {
      headerMap['tags'] = index;
    } else if (lower === 'status') {
      headerMap['status'] = index;
    }
  });

  const existingEmails = new Set(existingContacts.map((c) => normalizeEmail(c.email)));
  const existingPhones = new Set(existingContacts.map((c) => normalizePhone(c.phone)));

  const seenInSheetEmails = new Set<string>();
  const seenInSheetPhones = new Set<string>();

  const records: ValidatedImportRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || row.every((c) => !c || c.trim() === '')) {
      continue; // Skip empty rows
    }

    const rowNum = i + 1; // 1-indexed spreadsheet row
    const errors: string[] = [];

    const rawName = headerMap['name'] !== undefined ? row[headerMap['name']] || '' : row[0] || '';
    const rawEmail = headerMap['email'] !== undefined ? row[headerMap['email']] || '' : row[1] || '';
    const rawPhone = headerMap['phone'] !== undefined ? row[headerMap['phone']] || '' : row[2] || '';
    const rawCompany = headerMap['company'] !== undefined ? row[headerMap['company']] || '' : row[3] || '';
    const rawTags = headerMap['tags'] !== undefined ? row[headerMap['tags']] || '' : row[4] || '';

    const name = String(rawName).trim();
    const email = normalizeEmail(String(rawEmail));
    const phone = normalizePhone(String(rawPhone));
    const company = String(rawCompany).trim();

    // Parse tags (comma separated)
    const tags = String(rawTags)
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Validations
    if (!name) {
      errors.push('Name is required');
    }

    if (!email) {
      errors.push('Email is required');
    } else if (!EMAIL_REGEX.test(email)) {
      errors.push('Invalid email format');
    }

    if (!phone) {
      errors.push('Phone number is required');
    } else if (phone.length < 8) {
      errors.push('Phone number is too short');
    }

    // Duplicate detection in sheet
    if (email) {
      if (seenInSheetEmails.has(email)) {
        errors.push(`Duplicate email in Google Sheet: ${email}`);
      } else {
        seenInSheetEmails.add(email);
      }
    }

    if (phone) {
      if (seenInSheetPhones.has(phone)) {
        errors.push(`Duplicate phone in Google Sheet: ${phone}`);
      } else {
        seenInSheetPhones.add(phone);
      }
    }

    // Duplicate detection in Firestore database
    if (email && existingEmails.has(email)) {
      errors.push(`Email already exists in platform contacts: ${email}`);
    }

    if (phone && existingPhones.has(phone)) {
      errors.push(`Phone already exists in platform contacts: ${phone}`);
    }

    const isDupInFile = seenInSheetEmails.has(email) || seenInSheetPhones.has(phone);
    const isDupInDb = (!!email && existingEmails.has(email)) || (!!phone && existingPhones.has(phone));

    records.push({
      rowIndex: rowNum,
      data: {
        name: name || 'Unnamed Contact',
        email,
        phone,
        company: company || '',
        tags,
      },
      isValid: errors.length === 0,
      errors,
      isDuplicateInFile: isDupInFile,
      isExistingInDb: isDupInDb,
    });
  }

  const validCount = records.filter((r) => r.isValid).length;
  const invalidCount = records.length - validCount;

  return {
    headers: rawHeaders,
    totalRows: records.length,
    validCount,
    invalidCount,
    records,
  };
}

/**
 * Creates a brand new Google Spreadsheet populated with platform contacts and stylized headers
 */
export async function exportContactsToGoogleSheets(
  accessToken: string,
  title: string,
  contacts: Contact[]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; totalExported: number }> {
  // Step 1: Create spreadsheet container
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: title || `Contacts Export - ${new Date().toISOString().split('T')[0]}`,
      },
      sheets: [
        {
          properties: {
            title: 'Contacts Directory',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const errorBody = await createRes.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Failed to create Google Spreadsheet (HTTP ${createRes.status})`
    );
  }

  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;

  // Step 2: Prepare values
  const headerRow = [
    'Full Name',
    'Email Address',
    'Phone Number',
    'Company / Organization',
    'Tags',
    'Subscription Status',
    'Consent Given',
    'Added Date',
  ];

  const dataRows = contacts.map((c) => [
    c.name,
    c.email,
    c.phone,
    c.company || '',
    (c.tags || []).join(', '),
    c.status || 'subscribed',
    c.consentGiven ? 'YES' : 'NO',
    c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
  ]);

  const allRows = [headerRow, ...dataRows];

  // Step 3: Populate cells
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Contacts Directory'!A1?valueInputOption=USER_ENTERED`;
  const updateRes = await fetch(valuesUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: allRows,
    }),
  });

  if (!updateRes.ok) {
    const errorBody = await updateRes.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Failed to write values into Google Sheet (HTTP ${updateRes.status})`
    );
  }

  // Step 4: Batch update formatting (Stylize header row with Indigo background, white bold text)
  const sheetId = created.sheets?.[0]?.properties?.sheetId || 0;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.28, green: 0.29, blue: 0.92 }, // Indigo 600
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  fontSize: 11,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: sheetId,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: 8,
            },
          },
        },
      ],
    }),
  }).catch((err) => {
    console.warn('Formatting batch update non-fatal error:', err);
  });

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    totalExported: contacts.length,
  };
}

/**
 * Appends new contacts to an existing Google Spreadsheet
 */
export async function appendContactsToExistingSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
  contacts: Contact[]
): Promise<number> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const rows = contacts.map((c) => [
    c.name,
    c.email,
    c.phone,
    c.company || '',
    (c.tags || []).join(', '),
    c.status || 'subscribed',
    c.consentGiven ? 'YES' : 'NO',
    c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
  ]);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(sheetTitle)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: rows,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      errorBody?.error?.message || `Failed to append rows to sheet (HTTP ${res.status})`
    );
  }

  return contacts.length;
}
