import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Users, IndianRupee, Wallet, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { feesService, money, fmtDate, type StudentFeeRow, type FeeStatus } from '../../services/feesService';
import { StudentFeeManager } from './StudentFeeManager';

const FEE_STYLE: Record<FeeStatus, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200', partial: 'bg-amber-50 text-amber-800 border-amber-200',
  unpaid: 'bg-rose-50 text-rose-700 border-rose-200', no_fee: 'bg-slate-100 text-slate-600 border-slate-200',
};
const FEE_LABEL: Record<FeeStatus, string> = { paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid', no_fee: 'No fee set' };
type SortKey = 'full_name' | 'net_fee' | 'paid' | 'pending' | 'fee_status';
const filterSel = 'px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 min-w-0';

export const StudentFeesPanel: React.FC<{ openStudentId?: string | null; onOpened?: () => void }> = ({ openStudentId, onOpened }) => {
  const [rows, setRows] = useState<StudentFeeRow[]>([]);
  const [courses, setCourses] = useState<Array<{ id: string; name: string; fee_amount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [feeStatus, setFeeStatus] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('full_name'); const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<StudentFeeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await feesService.studentOverview('', status)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { feesService.listCourses().then(setCourses).catch(() => undefined); }, []);

  // Opened from the Students page: jump straight to that student's fee manager.
  useEffect(() => {
    if (!openStudentId || rows.length === 0) return;
    const r = rows.find((x) => x.student_id === openStudentId);
    if (r) { setSelected(r); onOpened?.(); }
  }, [openStudentId, rows, onOpened]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    const dir = sortDir === 'asc' ? 1 : -1;
    return rows
      .filter((r) => (!q || `${r.full_name} ${r.student_code || ''} ${r.phone || ''}`.toLowerCase().includes(q)) && (feeStatus === 'all' || r.fee_status === feeStatus))
      .sort((a, b) => {
        const x = a[sortKey] ?? ''; const y = b[sortKey] ?? '';
        const cx = typeof x === 'number' ? x : String(x).toLowerCase(); const cy = typeof y === 'number' ? y : String(y).toLowerCase();
        return (cx < cy ? -1 : cx > cy ? 1 : 0) * dir;
      });
  }, [rows, search, feeStatus, sortKey, sortDir]);

  const totals = useMemo(() => visible.reduce((t, r) => ({ net: t.net + (r.net_fee || 0), paid: t.paid + (r.paid || 0), due: t.due + (r.pending || 0) }), { net: 0, paid: 0, due: 0 }), [visible]);
  const toggle = (k: SortKey) => { if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(k); setSortDir(k === 'full_name' ? 'asc' : 'desc'); } };
  const Head: React.FC<{ k: SortKey; label: string; right?: boolean }> = ({ k, label, right }) => (
    <th className={`py-3 px-3 ${right ? 'text-right' : ''}`} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggle(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider font-semibold hover:text-slate-900 cursor-pointer ${right ? 'flex-row-reverse' : ''}`}>
        {label}{sortKey === k && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}</button></th>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[{ l: 'Students', v: String(visible.length), i: Users, c: 'text-slate-900' }, { l: 'Total fees (net)', v: money(totals.net), i: IndianRupee, c: 'text-slate-900' },
          { l: 'Collected', v: money(totals.paid), i: Wallet, c: 'text-emerald-700' }, { l: 'Pending', v: money(totals.due), i: AlertTriangle, c: totals.due > 0 ? 'text-rose-600' : 'text-slate-900' }].map((k) => (
          <div key={k.l} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs"><div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.l}</span><k.i className="w-4 h-4 text-slate-300" /></div>
            {loading ? <div className="mt-2 h-7 w-20 bg-slate-100 rounded animate-pulse" /> : <div className={`mt-1.5 text-2xl font-bold ${k.c}`}>{k.v}</div>}</div>))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-52"><Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, student ID or phone" className={`${filterSel} w-full pl-8`} /></div>
        <select aria-label="Student status" value={status} onChange={(e) => setStatus(e.target.value)} className={filterSel}><option value="all">All students</option><option value="active">Active</option><option value="completed">Completed</option><option value="paused">Paused</option><option value="withdrawn">Withdrawn</option></select>
        <select aria-label="Fee status" value={feeStatus} onChange={(e) => setFeeStatus(e.target.value)} className={filterSel}><option value="all">All fee statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partly paid</option><option value="paid">Paid</option><option value="no_fee">No fee set</option></select>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>

      {error && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">{error}</div>}

      <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? <div className="p-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div> : visible.length === 0 ? (
          <div className="p-10 text-center"><Users className="w-8 h-8 text-slate-300 mx-auto" /><p className="mt-3 text-sm font-semibold text-slate-800">{rows.length === 0 ? 'No students yet' : 'No students match'}</p>
            <p className="mt-1 text-xs text-slate-500">{rows.length === 0 ? 'Students appear here automatically when you add one or convert a lead.' : 'Try clearing the search or filters.'}</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-xs text-left min-w-[860px]">
            <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[10px]"><Head k="full_name" label="Student" /><th className="py-3 px-3 uppercase tracking-wider font-semibold">Batch</th>
              <Head k="net_fee" label="Net fee" right /><Head k="paid" label="Paid" right /><Head k="pending" label="Pending" right /><Head k="fee_status" label="Status" /><th className="py-3 px-3 uppercase tracking-wider font-semibold">Next due</th><th className="py-3 px-3" /></tr></thead>
            <tbody className="divide-y divide-slate-100">{visible.map((r) => (
              <tr key={r.student_id} className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setSelected(r)}>
                <td className="py-3 px-3"><div className="font-semibold text-slate-900">{r.full_name}</div><div className="text-[11px] text-slate-400">{r.student_code || '—'}{r.phone ? ` · ${r.phone}` : ''}</div></td>
                <td className="py-3 px-3 text-slate-600 max-w-52 truncate">{r.batches || <span className="text-slate-400">Not in a batch</span>}</td>
                <td className="py-3 px-3 text-right tabular-nums">{r.net_fee ? money(r.net_fee) : <span className="text-slate-400">—</span>}</td>
                <td className="py-3 px-3 text-right tabular-nums text-emerald-700 font-medium">{money(r.paid)}</td>
                <td className={`py-3 px-3 text-right tabular-nums font-semibold ${(r.pending || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(r.pending)}</td>
                <td className="py-3 px-3">{r.fee_status && <span className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full border ${FEE_STYLE[r.fee_status]}`}>{FEE_LABEL[r.fee_status]}</span>}</td>
                <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{r.next_due ? fmtDate(r.next_due) : '—'}</td>
                <td className="py-3 px-3 text-right"><button type="button" onClick={(e) => { e.stopPropagation(); setSelected(r); }} className="px-3 py-1.5 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md cursor-pointer">Manage fees</button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      <StudentFeeManager student={selected} courses={courses} onClose={() => setSelected(null)} onChanged={() => void load()} />
    </div>
  );
};
