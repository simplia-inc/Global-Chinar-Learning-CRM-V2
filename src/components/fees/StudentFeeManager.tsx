import React, { useCallback, useEffect, useState } from 'react';
import { Wallet, Plus, Trash2, Info } from 'lucide-react';
import { Modal } from '../common/Modal';
import { feesService, money, fmtDate, MODE_LABEL, type StudentFeeDetail, type StudentFeeRow, type FeeStatus, type PaymentMethod } from '../../services/feesService';

const METHODS: Array<{ v: PaymentMethod; l: string }> = [
  { v: 'cash', l: 'Cash' }, { v: 'upi', l: 'UPI' }, { v: 'bank_transfer', l: 'Bank transfer' }, { v: 'card', l: 'Card' }, { v: 'other', l: 'Other' },
];
const INST_STYLE: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200', partially_paid: 'bg-amber-50 text-amber-800 border-amber-200', unpaid: 'bg-rose-50 text-rose-700 border-rose-200',
};
const INST_LABEL: Record<string, string> = { paid: 'Paid', partially_paid: 'Partly paid', unpaid: 'Unpaid' };
const box = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600';
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

interface Props {
  student: Pick<StudentFeeRow, 'student_id' | 'full_name' | 'student_code'> | null;
  courses: Array<{ id: string; name: string; fee_amount: number }>;
  onClose: () => void;
  onChanged: () => void;
}

export const StudentFeeManager: React.FC<Props> = ({ student, courses, onClose, onChanged }) => {
  const [d, setD] = useState<StudentFeeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [total, setTotal] = useState(''); const [discount, setDiscount] = useState('0'); const [notes, setNotes] = useState('');
  const [instAmt, setInstAmt] = useState(''); const [instDue, setInstDue] = useState(''); const [instNote, setInstNote] = useState('');
  const [payAmt, setPayAmt] = useState(''); const [method, setMethod] = useState<PaymentMethod>('upi'); const [ref, setRef] = useState('');
  const [when, setWhen] = useState(nowLocal()); const [payNote, setPayNote] = useState('');
  const [revId, setRevId] = useState<string | null>(null); const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!student) return;
    setLoading(true); setErr(null);
    try {
      const x = await feesService.studentDetail(student.student_id);
      setD(x);
      setTotal(x.account && x.account.total_fee > 0 ? String(x.account.total_fee) : '');
      setDiscount(String(x.account?.discount_amount ?? 0)); setNotes(x.account?.notes || '');
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [student]);

  useEffect(() => { setMsg(null); setRevId(null); setReason(''); setInstAmt(''); setInstDue(''); setInstNote(''); setPayAmt(''); setRef(''); setPayNote(''); setWhen(nowLocal()); setD(null); void load(); }, [load]);

  const paid = d ? d.installments.reduce((a, i) => a + i.paid, 0) : 0;
  const net = d?.net_fee ?? 0;
  const pending = Math.max(net - paid, 0);
  const invoiced = d ? d.installments.reduce((a, i) => a + i.total_amount, 0) : 0;
  const unscheduled = Math.max(net - invoiced, 0);
  const status: FeeStatus = net <= 0 ? 'no_fee' : paid >= net ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  const STATUS_TXT: Record<FeeStatus, string> = { paid: 'Fully paid', partial: 'Partly paid', unpaid: 'Unpaid', no_fee: 'No fee set' };
  const STATUS_CLS: Record<FeeStatus, string> = { paid: 'text-emerald-700', partial: 'text-amber-700', unpaid: 'text-rose-600', no_fee: 'text-slate-500' };

  const run = async (fn: () => Promise<void>, ok: string, after?: () => void) => {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); setMsg(ok); after?.(); await load(); onChanged(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (!student) return null;
  return (
    <Modal isOpen={!!student} onClose={onClose} title={`Fee management — ${student.full_name}`} subtitle={student.student_code || 'Student ID pending'} maxWidth="4xl">
      {err && <div role="alert" className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">{err}</div>}
      {msg && <div role="status" className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-lg">{msg}</div>}
      {loading && !d ? <div className="h-40 bg-slate-100 rounded-lg animate-pulse" /> : d && (
        <div className="space-y-6 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-lg bg-slate-50"><div className="text-[11px] text-slate-400">Net fee</div><div className="text-lg font-bold">{money(net)}</div></div>
            <div className="p-3 rounded-lg bg-slate-50"><div className="text-[11px] text-slate-400">Paid</div><div className="text-lg font-bold text-emerald-700">{money(paid)}</div></div>
            <div className="p-3 rounded-lg bg-rose-50"><div className="text-[11px] text-rose-400">Pending</div><div className="text-lg font-bold text-rose-600">{money(pending)}</div></div>
            <div className="p-3 rounded-lg bg-slate-50"><div className="text-[11px] text-slate-400">Status</div><div className={`text-lg font-bold ${STATUS_CLS[status]}`}>{STATUS_TXT[status]}</div></div>
          </div>

          <section>
            <h3 className="font-semibold text-slate-900">Fee details</h3>
            {d.enrollments.length > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">Batches: {d.enrollments.map((e) => `${e.batch_name} (${MODE_LABEL[e.delivery_mode]}, ${money(e.agreed_fee - e.discount)})`).join(' · ')}</p>
            )}
            <form className="mt-3 grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void run(() => feesService.setStudentFee(student.student_id, Number(total) || 0, Number(discount) || 0, notes), 'Fee details saved.'); }}>
              <label className="sm:col-span-2 text-xs font-medium text-slate-700">Course fee (₹)
                <div className="flex gap-2 mt-1">
                  <input type="number" min="0" step="1" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="0 = use batch fees" className={box} />
                  <select aria-label="Fill from course" value="" onChange={(e) => { const c = courses.find((x) => x.id === e.target.value); if (c) setTotal(String(c.fee_amount)); }} className={`${box} w-40`}>
                    <option value="">Fill from course…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name} · {money(c.fee_amount)}</option>)}
                  </select>
                </div>
              </label>
              <label className="text-xs font-medium text-slate-700">Discount (₹)<input type="number" min="0" step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} className={`${box} mt-1`} /></label>
              <div className="flex items-end"><button disabled={busy} className="w-full px-4 py-2 bg-slate-900 text-white font-semibold rounded-lg text-sm disabled:opacity-50 cursor-pointer">Save fee</button></div>
              <label className="sm:col-span-4 text-xs font-medium text-slate-700">Notes<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. includes materials, scholarship terms" className={`${box} mt-1`} /></label>
            </form>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />Leave the course fee empty (0) to use the fee agreed when the student was enrolled in a batch.</p>
          </section>

          <section>
            <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-900">Installments</h3><span className="text-[11px] text-slate-400">Still to schedule: {money(unscheduled)}</span></div>
            {d.installments.length === 0 ? <p className="mt-2 text-xs text-slate-500">No installments yet. Add them below, or just record payments.</p> : (
              <ul className="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {d.installments.map((i, idx) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="text-xs text-slate-400 w-5">{idx + 1}</span>
                    <div className="flex-1 min-w-40"><div className="font-semibold tabular-nums">{money(i.total_amount)}<span className="ml-2 text-[11px] font-normal text-slate-400">paid {money(i.paid)}</span></div>
                      <div className="text-[11px] text-slate-500">{i.due_date ? `Due ${fmtDate(i.due_date)}` : 'No due date'} · {i.invoice_number}{i.enrollment_id ? ' · from batch enrolment' : ''}{i.notes ? ` · ${i.notes}` : ''}</div></div>
                    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border ${INST_STYLE[i.status] || ''}`}>{INST_LABEL[i.status] || i.status}</span>
                    {!i.enrollment_id && i.paid === 0 && (
                      <button type="button" aria-label="Remove installment" disabled={busy} onClick={() => { if (window.confirm('Remove this installment?')) void run(() => feesService.voidInstallment(i.id), 'Installment removed.'); }} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </li>))}
              </ul>
            )}
            <form className="mt-3 grid gap-2 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); void run(() => feesService.addInstallment(student.student_id, Number(instAmt), instDue, instNote), 'Installment added.', () => { setInstAmt(''); setInstDue(''); setInstNote(''); }); }}>
              <input aria-label="Installment amount" type="number" min="1" step="1" required value={instAmt} onChange={(e) => setInstAmt(e.target.value)} placeholder="Amount (₹)" className={box} />
              <input aria-label="Due date" type="date" value={instDue} onChange={(e) => setInstDue(e.target.value)} className={box} />
              <input aria-label="Installment note" value={instNote} onChange={(e) => setInstNote(e.target.value)} placeholder="Note (optional)" className={`${box} sm:col-span-2`} />
              <button disabled={busy || unscheduled <= 0} className="inline-flex items-center justify-center gap-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 cursor-pointer"><Plus className="w-4 h-4" />Add</button>
            </form>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900">Record a payment</h3>
            <form className="mt-3 grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); const n = Number(payAmt); if (n > pending) { setErr(`Amount is more than the pending ${money(pending)}.`); return; } void run(() => feesService.recordStudentPayment({ studentId: student.student_id, amount: n, method, reference: ref, paidAt: when, notes: payNote }), `Payment of ${money(n)} recorded.`, () => { setPayAmt(''); setRef(''); setPayNote(''); setWhen(nowLocal()); }); }}>
              <label className="text-xs font-medium text-slate-700">Amount (₹)<input type="number" min="1" step="0.01" max={pending} required value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder={pending > 0 ? `up to ${pending}` : ''} className={`${box} mt-1`} /></label>
              <label className="text-xs font-medium text-slate-700">Method<select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={`${box} mt-1`}>{METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></label>
              <label className="text-xs font-medium text-slate-700">Received on<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${box} mt-1`} /></label>
              <label className="text-xs font-medium text-slate-700">Reference<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UPI / receipt no." className={`${box} mt-1`} /></label>
              <label className="sm:col-span-3 text-xs font-medium text-slate-700">Notes<input value={payNote} onChange={(e) => setPayNote(e.target.value)} className={`${box} mt-1`} /></label>
              <div className="flex items-end"><button disabled={busy || pending <= 0} className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-lg text-sm disabled:opacity-50 cursor-pointer"><Wallet className="w-4 h-4" />Save payment</button></div>
            </form>
            <p className="mt-2 text-[11px] text-slate-400">Payments are applied to the earliest unpaid installment first.</p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900">Payment history</h3>
            {d.payments.length === 0 ? <p className="mt-2 text-xs text-slate-500">No payments recorded yet.</p> : (
              <ul className="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-48">
                      <div className="flex items-center gap-2"><span className={`font-bold tabular-nums ${p.entry_type === 'reversal' ? 'text-rose-600' : p.is_reversed ? 'text-slate-400 line-through' : 'text-emerald-700'}`}>{p.entry_type === 'reversal' ? '−' : ''}{money(p.amount)}</span>
                        {p.entry_type === 'reversal' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">Reversal</span>}
                        {p.is_reversed && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Reversed</span>}</div>
                      <div className="text-[11px] text-slate-500">{fmtDate(p.payment_date)} · {p.method.replace('_', ' ')}{p.reference_number ? ` · ${p.reference_number}` : ''} · {p.invoice_number}{p.reversal_reason ? ` · Reason: ${p.reversal_reason}` : ''}{p.notes ? ` · ${p.notes}` : ''}</div>
                    </div>
                    {p.entry_type === 'payment' && !p.is_reversed && (revId === p.id ? (
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for reversal" aria-label="Reason for reversal" className="px-2 py-1.5 border border-slate-300 rounded-md text-xs flex-1 min-w-40" />
                        <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void run(() => feesService.reversePayment(p.id, reason.trim()), 'Payment reversed. The original entry stays on record.', () => { setRevId(null); setReason(''); })} className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-md disabled:opacity-50 cursor-pointer">Confirm</button>
                        <button type="button" onClick={() => { setRevId(null); setReason(''); }} className="text-xs text-slate-500 cursor-pointer">Cancel</button>
                      </div>
                    ) : <button type="button" onClick={() => setRevId(p.id)} className="px-2.5 py-1.5 text-xs text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-md cursor-pointer">Reverse</button>)}
                  </li>))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-slate-400">Payments are never deleted. A mistake is corrected with a reversal that stays on record.</p>
          </section>
        </div>
      )}
    </Modal>
  );
};
