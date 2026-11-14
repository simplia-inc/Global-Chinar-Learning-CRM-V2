import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, AlertTriangle } from 'lucide-react';
import { feesService, money, monthLabel, MODE_LABEL, type BatchOverviewRow, type StudentFeeRow } from '../../services/feesService';

// Students who have fee records but are not in any batch yet. Assigning one links their fees to that batch.
export const UnassignedStudents: React.FC<{ onAssigned: (message: string) => void }> = ({ onAssigned }) => {
  const [students, setStudents] = useState<StudentFeeRow[]>([]);
  const [batches, setBatches] = useState<BatchOverviewRow[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Open batches only; the nearest start date with seats left is the default choice.
  const openBatches = useMemo(
    () => batches.filter((b) => b.status === 'planned' || b.status === 'ongoing')
      .sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999')),
    [batches],
  );
  const defaultBatch = openBatches.find((b) => b.seats_left === null || b.seats_left > 0)?.batch_id ?? '';

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [rows, overview] = await Promise.all([feesService.studentOverview(), feesService.overview({})]);
      setStudents(rows.filter((r) => !r.batches));
      setBatches(overview);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const assign = async (s: StudentFeeRow) => {
    const batchId = choice[s.student_id] || defaultBatch;
    const batch = openBatches.find((b) => b.batch_id === batchId);
    if (!batch) { setErr('There is no open batch to assign this student to. Create a batch first.'); return; }
    setBusy(s.student_id); setErr(null);
    try {
      await feesService.assignToBatch(s.student_id, batch.batch_id);
      onAssigned(`${s.full_name} is now in ${batch.name}. Their fees and payments are linked to this batch.`);
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  if (!loading && students.length === 0 && !err) return null;

  return (
    <section className="bg-white border border-amber-200 rounded-xl shadow-xs overflow-hidden print:hidden">
      <header className="px-5 py-3.5 border-b border-amber-100 bg-amber-50/50">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" />Students not in a batch yet</h2>
        <p className="text-[11px] text-slate-600">They have fees on record but no batch, so their money is not counted in any batch. Assign them to see their fees in the batch tables.</p>
      </header>
      {err && <div role="alert" className="mx-5 mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">{err}</div>}
      {loading ? <div className="p-5 h-16 bg-slate-50 animate-pulse" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left min-w-[640px]">
            <thead><tr className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-100">
              <th className="py-2.5 px-5">Student</th><th className="py-2.5 px-3 text-right">Net fee</th><th className="py-2.5 px-3 text-right">Pending</th><th className="py-2.5 px-3">Batch</th><th className="py-2.5 px-3" />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.student_id}>
                  <td className="py-2.5 px-5"><div className="font-semibold text-slate-900">{s.full_name}</div><div className="text-[11px] text-slate-400">{s.student_code || '—'}{s.phone ? ` · ${s.phone}` : ''}</div></td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{money(s.net_fee)}</td>
                  <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${(s.pending || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(s.pending)}</td>
                  <td className="py-2.5 px-3">
                    <select aria-label={`Batch for ${s.full_name}`} value={choice[s.student_id] || defaultBatch} onChange={(e) => setChoice({ ...choice, [s.student_id]: e.target.value })}
                      className="w-full max-w-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs">
                      {openBatches.length === 0 && <option value="">No open batch</option>}
                      {openBatches.map((b) => (
                        <option key={b.batch_id} value={b.batch_id}>{b.name} · {MODE_LABEL[b.delivery_mode]} · {monthLabel(b.start_date)}{b.seats_left !== null ? ` · ${b.seats_left} left` : ''}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button type="button" disabled={busy === s.student_id || openBatches.length === 0} onClick={() => void assign(s)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer disabled:opacity-50">
                      <UserPlus className="w-3 h-3" />{busy === s.student_id ? 'Assigning…' : 'Assign'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
