import { createHash } from 'node:crypto';

export const CRM_FIELDS = ['full_name', 'email', 'phone', 'interested_course', 'source', 'notes', 'status', 'priority', 'external_id'];
export const MAX_ROWS = 20000;

const SYNONYMS = {
  full_name: ['full name', 'name', 'student name', 'lead name', 'customer name', 'candidate name', 'candidate', 'client name'],
  email: ['email', 'e-mail', 'email id', 'email address', 'mail'],
  phone: ['phone', 'mobile', 'mobile number', 'phone number', 'contact', 'contact number', 'contact details', 'whatsapp', 'whatsapp number'],
  interested_course: ['interested course', 'course', 'course interested', 'program', 'programme', 'interested in', 'service', 'services'],
  source: ['source', 'lead source', 'channel', 'platform', 'came from'],
  notes: ['notes', 'note', 'remarks', 'remark', 'remark\'s', 'comments', 'message'],
  status: ['status', 'lead status', 'stage'],
  priority: ['priority'],
  external_id: ['lead id', 'external id', 'unique id', 'uid', 'enquiry id', 'inquiry id', 'id'],
};

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export function suggestMapping(headers) {
  const used = new Set();
  const mapping = {};
  const lower = headers.map(norm);
  for (const field of CRM_FIELDS) {
    for (const syn of SYNONYMS[field]) {
      const idx = lower.findIndex((h, i) => h === syn && !used.has(i));
      if (idx !== -1) { mapping[field] = headers[idx]; used.add(idx); break; }
    }
  }
  return mapping;
}

export function validateMapping(mapping, headers) {
  const errors = [];
  const set = new Set(headers);
  for (const [field, header] of Object.entries(mapping || {})) {
    if (!CRM_FIELDS.includes(field)) errors.push(`Unknown CRM field "${field}"`);
    else if (header && !set.has(header)) errors.push(`Column "${header}" was not found in the worksheet`);
  }
  if (!mapping?.full_name) errors.push('Map a column to Full name');
  if (!mapping?.phone && !mapping?.email) errors.push('Map a column to Phone or Email so leads can be identified');
  return errors;
}

const STATUS_SYNONYMS = {
  'follow up': 'follow_up', followup: 'follow_up', 'in progress': 'follow_up', interested: 'qualified', hot: 'qualified',
  enrolled: 'converted', admitted: 'converted', closed: 'lost', 'not interested': 'lost',
};
const STATUSES = ['new', 'contacted', 'follow_up', 'qualified', 'converted', 'lost'];
export function normalizeStatus(v) {
  const s = norm(v).replace(/[-_]/g, ' ');
  if (!s) return undefined;
  const mapped = STATUS_SYNONYMS[s] ?? s.replace(/ /g, '_');
  return STATUSES.includes(mapped) ? mapped : undefined;
}
export function normalizePriority(v) {
  const s = norm(v);
  if (!s) return undefined;
  const mapped = { medium: 'normal', urgent: 'high', hot: 'high' }[s] ?? s;
  return ['low', 'normal', 'high'].includes(mapped) ? mapped : undefined;
}

// A cell may hold several numbers ("98765 43210 / 91234 56789"); keep the first usable one.
export function cleanPhone(v) {
  const first = String(v ?? '').split(/[\/,;\n|]| or /i)[0];
  const cleaned = first.replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? cleaned : '';
}
export function cleanEmail(v) {
  const e = String(v ?? '').trim().split(/[\s,;]/)[0].toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : '';
}

export function buildLeadRows(table, mapping) {
  const headers = (table[0] || []).map((h) => String(h ?? '').trim());
  const idx = {};
  for (const [field, header] of Object.entries(mapping)) {
    if (header) { const i = headers.indexOf(header); if (i !== -1) idx[field] = i; }
  }
  const cell = (r, f) => (idx[f] === undefined ? '' : String(r[idx[f]] ?? '').trim());

  const valid = [];
  const errors = [];
  const seen = new Map();
  let scanned = 0;
  const dataRows = table.slice(1, MAX_ROWS + 1);
  dataRows.forEach((r, i) => {
    const rowNumber = i + 2;
    if (!r.some((c) => String(c ?? '').trim() !== '')) return; // blank row
    scanned++;
    const full_name = cell(r, 'full_name');
    const phone = cleanPhone(cell(r, 'phone'));
    const email = cleanEmail(cell(r, 'email'));
    const extId = cell(r, 'external_id');
    if (!full_name) { errors.push({ row_number: rowNumber, error_type: 'invalid', message: 'Full name is empty' }); return; }
    if (!phone && !email) { errors.push({ row_number: rowNumber, error_type: 'invalid', message: 'No valid phone number or email address' }); return; }
    const key = extId ? `id:${extId.slice(0, 120)}` : phone ? `phone:${phone.replace(/\D/g, '').slice(-10)}` : `email:${email}`;
    if (seen.has(key)) {
      errors.push({ row_number: rowNumber, error_type: 'duplicate', message: `Same lead as row ${seen.get(key)} in this sheet; skipped` });
      return;
    }
    seen.set(key, rowNumber);
    const course = cell(r, 'interested_course');
    const source = cell(r, 'source');
    const notes = cell(r, 'notes');
    valid.push({
      row_number: rowNumber, key, full_name: full_name.slice(0, 200), email, phone,
      course: course.slice(0, 200), source: source.slice(0, 120), notes: notes.slice(0, 5000),
      status: normalizeStatus(cell(r, 'status')), priority: normalizePriority(cell(r, 'priority')),
      hash: createHash('sha256').update(JSON.stringify([full_name, email, phone, course, source, notes])).digest('hex').slice(0, 32),
    });
  });
  return { valid, errors, scanned, truncated: table.length - 1 > MAX_ROWS };
}
