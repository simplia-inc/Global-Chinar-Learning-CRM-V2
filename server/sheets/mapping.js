import { createHash } from 'node:crypto';

export const CRM_FIELDS = ['full_name', 'email', 'phone', 'interested_course', 'source', 'notes', 'extra_notes', 'status', 'priority', 'external_id'];
// Not a column: when set to 'on', a status is suggested from the remarks for NEW leads that have no status value.
export const AUTO_STATUS_KEY = 'auto_status';
export const MAX_ROWS = 20000;

const SYNONYMS = {
  full_name: ['full name', 'name', 'student name', 'lead name', 'customer name', 'candidate name', 'candidate', 'client name'],
  email: ['email', 'e-mail', 'email id', 'email address', 'mail'],
  phone: ['phone', 'number', 'mobile', 'mobile number', 'mobile no', 'mob', 'mob no', 'phone no', 'phone number', 'contact', 'contact number', 'contact no', 'contact details', 'cell', 'telephone', 'whatsapp', 'whatsapp number'],
  interested_course: ['interested course', 'course', 'course interested', 'program', 'programme', 'interested in', 'service', 'services'],
  source: ['source', 'lead source', 'channel', 'platform', 'came from'],
  notes: ['notes', 'note', 'remarks', 'remark', 'remark\'s', 'comments', 'message'],
  extra_notes: [],
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
  // Loose pass: a column such as "Uzair Note" or "Staff remarks" becomes the notes (or additional notes) column.
  for (const field of ['notes', 'extra_notes']) {
    if (mapping[field]) continue;
    const idx = lower.findIndex((h, i) => !used.has(i) && /note|remark|comment/.test(h));
    if (idx !== -1) { mapping[field] = headers[idx]; used.add(idx); }
  }
  return mapping;
}

export function validateMapping(mapping, headers) {
  const errors = [];
  const set = new Set(headers);
  for (const [field, header] of Object.entries(mapping || {})) {
    if (field === AUTO_STATUS_KEY) { if (header && header !== 'on') errors.push('Invalid status suggestion setting'); continue; }
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

// Conservative suggestion from free-text remarks. Used only when the sheet has no Status value.
export function deriveStatus(text) {
  const t = ` ${String(text ?? '').toLowerCase()} `;
  // Deliberately NOT matching "ni": in some sheets it is a staff signature ("will visit tomorrow / NI"), not "not interested".
  if (/not interested|no enquiry|clicked by mistake|wrong number/.test(t)) return 'lost';
  if (/\bsale\b/.test(t)) return 'qualified'; // payment taken: ready for enrolment, staff converts it in the CRM
  if (/will visit|visit booked|will come|call ?back|c\.b\b|will confirm|will tell|will pay|will discuss|will join|follow ?up|wants|need information|demo|shared (qr|pdf|details)|\bbro(u)?ch\w*/.test(t)) return 'follow_up';
  return undefined;
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
    if (CRM_FIELDS.includes(field) && header) { const i = headers.indexOf(header); if (i !== -1) idx[field] = i; }
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
    const rawName = cell(r, 'full_name');
    const phone = cleanPhone(cell(r, 'phone'));
    const email = cleanEmail(cell(r, 'email'));
    const extId = cell(r, 'external_id');
    if (!phone && !email) { errors.push({ row_number: rowNumber, error_type: 'invalid', message: 'No valid phone number or email address' }); return; }
    // A caller with a number but no name is still a lead: keep it under a placeholder name staff can rename in the CRM.
    const placeholder = !rawName;
    const full_name = rawName || `Unnamed lead ${phone || email}`;
    const key = extId ? `id:${extId.slice(0, 120)}` : phone ? `phone:${phone.replace(/\D/g, '').slice(-10)}` : `email:${email}`;
    if (seen.has(key)) {
      errors.push({ row_number: rowNumber, error_type: 'duplicate', message: `Same lead as row ${seen.get(key)} in this sheet; skipped` });
      return;
    }
    seen.set(key, rowNumber);
    const course = cell(r, 'interested_course');
    const source = cell(r, 'source');
    const extra = cell(r, 'extra_notes');
    const notes = [cell(r, 'notes'), extra && `${mapping.extra_notes}: ${extra}`].filter(Boolean).join('\n');
    const explicitStatus = normalizeStatus(cell(r, 'status'));
    const status = explicitStatus ?? (mapping[AUTO_STATUS_KEY] === 'on' ? deriveStatus(notes) : undefined);
    valid.push({
      row_number: rowNumber, key, full_name: full_name.slice(0, 200), name_placeholder: placeholder, email, phone,
      course: course.slice(0, 200), source: source.slice(0, 120), notes: notes.slice(0, 5000),
      status, priority: normalizePriority(cell(r, 'priority')),
      hash: createHash('sha256').update(JSON.stringify([rawName, email, phone, course, source, notes])).digest('hex').slice(0, 32),
    });
  });
  return { valid, errors, scanned, truncated: table.length - 1 > MAX_ROWS };
}
