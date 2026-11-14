import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UnassignedStudents } from './UnassignedStudents';
import { RefreshCw, Download, Printer, Plus, Wallet, Users, IndianRupee, AlertTriangle, ArrowUp, ArrowDown, History, Search } from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  feesService, money, fmtDate, monthLabel, MODE_LABEL,
  type BatchOverviewRow, type RosterRow, type PaymentRow, type DeliveryMode, type FeeStatus, type PaymentMethod,
} from '../../services/feesService';

const MODE_STYLE: Record<DeliveryMode, string> = {
  online: 'bg-sky-50 text-sky-700 border-sky-200', offline: 'bg-amber-50 text-amber-800 border-amber-200', hybrid: 'bg-violet-50 text-violet-700 border-violet-200',
};
const FEE_STYLE: Record<FeeStatus, string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200', partial: 'bg-amber-50 text-amber-800 border-amber-200',
  unpaid: 'bg-rose-50 text-rose-700 border-rose-200', no_fee: 'bg-slate-100 text-slate-600 border-slate-200',
};
const FEE_LABEL: Record<FeeStatus, string> = { paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid', no_fee: 'No fee' };
const METHODS: Array<{ v: PaymentMethod; l: string }> = [
  { v: 'cash', l: 'Cash' }, { v: 'upi', l: 'UPI' }, { v: 'bank_transfer', l: 'Bank transfer' }, { v: 'card', l: 'Card' }, { v: 'other', l: 'Other' },
];

const ModeBadge: React.FC<{ mode: DeliveryMode }> = ({ mode }) => (
  <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${MODE_STYLE[mode]}`}>{MODE_LABEL[mode]}</span>
);
const FeeBadge: React.FC<{ status: FeeStatus | null }> = ({ status }) =>
  status ? <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded-full border ${FEE_STYLE[status]}`}>{FEE_LABEL[status]}</span> : <span>—</span>;

type SortKey = 'student_name' | 'batch_start' | 'delivery_mode' | 'net_fee' | 'paid' | 'outstanding' | 'fee_status';
const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600';
const filterSel = 'px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600 min-w-0';

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const BatchFeesView: React.FC = () => {
  const [month, setMonth] = useState('');
  const [mode, setMode] = useState('all');
  const [courseId, setCourseId] = useState('all');
  const [batchId, setBatchId] = useState('all');
  const [includeWithdrawn, setIncludeWithdrawn] = useState(false);
  const [search, setSearch] = useState('');
  const [grouped, setGrouped] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('student_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [batches, setBatches] = useState<BatchOverviewRow[]>([]);
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [courses, setCourses] = useState<Array<{ id: string; name: string; fee_amount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [enrolOpen, setEnrolOpen] = useState(false);
  const [payRow, setPayRow] = useState<RosterRow | null>(null);
  const [historyRow, setHistoryRow] = useState<RosterRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const f = { month, mode, courseId, batchId, includeWithdrawn };
      const [o, r] = await Promise.all([feesService.overview(f), feesService.roster(f)]);
      setBatches(o); setRows(r);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [month, mode, courseId, batchId, includeWithdrawn]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { feesService.listCourses().then(setCourses).catch(() => undefined); }, []);

  // Batch list for the batch filter must not shrink when a batch is selected.
  const [allBatches, setAllBatches] = useState<BatchOverviewRow[]>([]);
  useEffect(() => { feesService.overview({ month, mode, courseId }).then(setAllBatches).catch(() => undefined); }, [month, mode, courseId]);
  useEffect(() => { if (batchId !== 'all' && allBatches.length && !allBatches.some((b) => b.batch_id === batchId)) setBatchId('all'); }, [allBatches, batchId]);

  const visibleRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = rows.filter((r) => !q || `${r.student_name} ${r.student_code || ''} ${r.phone || ''}`.toLowerCase().includes(q));
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r: RosterRow): string | number => {
      const v = r[sortKey as keyof RosterRow];
      return typeof v === 'number' ? v : String(v ?? '').toLowerCase();
    };
    return [...list].sort((a, b) => {
      const x = val(a); const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = { students: visibleRows.length, net: 0, paid: 0, due: 0 };
    visibleRows.forEach((r) => { t.net += r.net_fee || 0; t.paid += r.paid || 0; t.due += r.outstanding || 0; });
    return t;
  }, [visibleRows]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; rows: RosterRow[] }>();
    visibleRows.forEach((r) => { if (!map.has(r.batch_id)) map.set(r.batch_id, { key: r.batch_id, rows: [] }); map.get(r.batch_id)!.rows.push(r); });
    return [...map.values()].sort((a, b) => (b.rows[0].batch_start || '').localeCompare(a.rows[0].batch_start || ''));
  }, [visibleRows]);

  const toggleSort = (k: SortKey) => { if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(k); setSortDir(k === 'student_name' || k === 'delivery_mode' ? 'asc' : 'desc'); } };
  const SortHead: React.FC<{ k: SortKey; label: string; right?: boolean }> = ({ k, label, right }) => (
    <th className={`py-3 px-3 ${right ? 'text-right' : ''}`} aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 uppercase tracking-wider font-semibold hover:text-slate-900 cursor-pointer ${right ? 'flex-row-reverse' : ''}`}>
        {label}{sortKey === k && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const exportCsv = () => {
    const head = ['Batch', 'Mode', 'Course', 'Batch start', 'Student ID', 'Student', 'Phone', 'Enrolment status', 'Agreed fee', 'Discount', 'Net fee', 'Paid', 'Outstanding', 'Fee status', 'Next due', 'Last payment'];
    const lines = visibleRows.map((r) => [r.batch_name, MODE_LABEL[r.delivery_mode], r.course_name, r.batch_start, r.student_code, r.student_name, r.phone, r.enrollment_status,
      r.agreed_fee, r.discount, r.net_fee, r.paid, r.outstanding, r.fee_status ? FEE_LABEL[r.fee_status] : '', r.next_due, r.last_payment_at ? r.last_payment_at.slice(0, 10) : ''].map(csvCell).join(','));
    const blob = new Blob(['\uFEFF' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `batch-fees-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  const done = async (msg: string) => { setNotice(msg); await load(); };
  const rate = totals.net > 0 ? Math.round((totals.paid / totals.net) * 100) : 0;
  const filterText = [month ? monthLabel(`${month}-01`) : 'All months', mode === 'all' ? 'All modes' : MODE_LABEL[mode as DeliveryMode],
    batchId !== 'all' ? allBatches.find((b) => b.batch_id === batchId)?.name : 'All batches'].filter(Boolean).join(' · ');

  const RosterRowView: React.FC<{ r: RosterRow; showBatch: boolean }> = ({ r, showBatch }) => (
    <tr className="hover:bg-slate-50/70">
      <td className="py-3 px-3">
        <div className="font-semibold text-slate-900">{r.student_name}</div>
        <div className="text-[11px] text-slate-400">{r.student_code || '—'}{r.phone ? ` · ${r.phone}` : ''}{r.enrollment_status !== 'active' ? ` · ${r.enrollment_status}` : ''}</div>
      </td>
      {showBatch && <td className="py-3 px-3"><div className="text-slate-800">{r.batch_name}</div><div className="mt-0.5"><ModeBadge mode={r.delivery_mode} /></div></td>}
      <td className="py-3 px-3 text-right tabular-nums text-slate-700">{money(r.net_fee)}{(r.discount || 0) > 0 && <div className="text-[10px] text-slate-400">after {money(r.discount)} discount</div>}</td>
      <td className="py-3 px-3 text-right tabular-nums text-emerald-700 font-medium">{money(r.paid)}</td>
      <td className={`py-3 px-3 text-right tabular-nums font-semibold ${(r.outstanding || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(r.outstanding)}</td>
      <td className="py-3 px-3"><FeeBadge status={r.fee_status} /></td>
      <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{r.next_due ? fmtDate(r.next_due) : '—'}</td>
      <td className="py-3 px-3 print:hidden">
        <div className="flex items-center justify-end gap-1.5">
          {(r.outstanding || 0) > 0 && r.enrollment_status !== 'withdrawn' && (
            <button type="button" onClick={() => setPayRow(r)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md cursor-pointer"><Wallet className="w-3 h-3" />Record payment</button>
          )}
          <button type="button" onClick={() => setHistoryRow(r)} title="Payment history" aria-label={`Payment history for ${r.student_name}`} className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"><History className="w-4 h-4" /></button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Global Chinar Digital Marketing School — Batch-wise Fee Report</h1>
        <p className="text-sm text-slate-600">{filterText} · Generated {fmtDate(new Date().toISOString())}</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Finance</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Batch Fees &amp; Students</h1>
          <p className="mt-1 text-sm text-slate-500">Every student by batch, with fees, payments and outstanding balance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          <button type="button" onClick={exportCsv} disabled={visibleRows.length === 0} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50"><Download className="w-3.5 h-3.5" />Export CSV</button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"><Printer className="w-3.5 h-3.5" />Print</button>
          <button type="button" onClick={() => setEnrolOpen(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"><Plus className="w-3.5 h-3.5" />Enrol student</button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs print:hidden space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Batch month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${filterSel} w-full mt-1 normal-case`} />
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mode
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${filterSel} w-full mt-1 normal-case`}>
              <option value="all">All modes</option><option value="online">Online</option><option value="offline">Offline</option><option value="hybrid">Hybrid</option>
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Course
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className={`${filterSel} w-full mt-1 normal-case`}>
              <option value="all">All courses</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Batch
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className={`${filterSel} w-full mt-1 normal-case`}>
              <option value="all">All batches</option>{allBatches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.name} ({MODE_LABEL[b.delivery_mode]})</option>)}
            </select>
          </label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 col-span-2 xl:col-span-2">Find student
            <div className="relative mt-1"><Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, student ID or phone" className={`${filterSel} w-full pl-8 normal-case`} /></div>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} className="accent-teal-600" />Group students by batch</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={includeWithdrawn} onChange={(e) => setIncludeWithdrawn(e.target.checked)} className="accent-teal-600" />Include withdrawn</label>
          {(month || mode !== 'all' || courseId !== 'all' || batchId !== 'all' || search) && (
            <button type="button" onClick={() => { setMonth(''); setMode('all'); setCourseId('all'); setBatchId('all'); setSearch(''); }} className="text-teal-700 hover:underline cursor-pointer">Clear filters</button>
          )}
        </div>
      </div>

      {notice && <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex justify-between print:hidden"><span>{notice}</span><button type="button" onClick={() => setNotice(null)} className="font-semibold underline cursor-pointer">Dismiss</button></div>}
      {error && <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { l: 'Students', v: String(totals.students), i: Users, c: 'text-slate-900' },
          { l: 'Total fees (net)', v: money(totals.net), i: IndianRupee, c: 'text-slate-900' },
          { l: 'Collected', v: money(totals.paid), i: Wallet, c: 'text-emerald-700' },
          { l: 'Outstanding', v: money(totals.due), i: AlertTriangle, c: totals.due > 0 ? 'text-rose-600' : 'text-slate-900' },
          { l: 'Collection rate', v: `${rate}%`, i: IndianRupee, c: 'text-teal-700' },
        ].map((k) => (
          <div key={k.l} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs print:shadow-none">
            <div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.l}</span><k.i className="w-4 h-4 text-slate-300" /></div>
            {loading ? <div className="mt-2 h-7 w-20 bg-slate-100 rounded animate-pulse" /> : <div className={`mt-1.5 text-2xl font-bold tracking-tight ${k.c}`}>{k.v}</div>}
          </div>
        ))}
      </div>

      <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <header className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-900">Batches</h2><p className="text-[11px] text-slate-500">{filterText}. Select a batch to see only its students.</p></header>
        {loading ? <div className="p-6 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div> : batches.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No batches match these filters. Create batches under Batches, then enrol students here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[860px]">
              <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px] font-semibold">
                <th className="py-3 px-4">Batch</th><th className="py-3 px-3">Mode</th><th className="py-3 px-3">Starts</th><th className="py-3 px-3 text-right">Students</th>
                <th className="py-3 px-3 text-right">Total fees</th><th className="py-3 px-3 text-right">Collected</th><th className="py-3 px-3 text-right">Outstanding</th><th className="py-3 px-3 w-32">Collection</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => {
                  const pct = b.net_fee_total && b.net_fee_total > 0 ? Math.round(((b.collected || 0) / b.net_fee_total) * 100) : 0;
                  return (
                    <tr key={b.batch_id} onClick={() => setBatchId(batchId === b.batch_id ? 'all' : b.batch_id)} className={`cursor-pointer hover:bg-slate-50 ${batchId === b.batch_id ? 'bg-teal-50/60' : ''}`}>
                      <td className="py-3 px-4"><div className="font-semibold text-slate-900">{b.name}</div><div className="text-[11px] text-slate-400">{b.code || '—'}{b.course_name ? ` · ${b.course_name}` : ''}</div></td>
                      <td className="py-3 px-3"><ModeBadge mode={b.delivery_mode} /></td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{fmtDate(b.start_date)}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{b.enrolled}{b.capacity ? <span className="text-slate-400"> / {b.capacity}</span> : ''}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{money(b.net_fee_total)}</td>
                      <td className="py-3 px-3 text-right tabular-nums text-emerald-700">{money(b.collected)}</td>
                      <td className={`py-3 px-3 text-right tabular-nums font-semibold ${(b.outstanding || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(b.outstanding)}</td>
                      <td className="py-3 px-3"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-600 rounded-full" style={{ width: `${pct}%` }} /></div><span className="text-[10px] text-slate-500 tabular-nums w-8 text-right">{pct}%</span></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <UnassignedStudents onAssigned={async (m) => { setNotice(m); await load(); }} />

      <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <header className="px-5 py-3.5 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-900">Students &amp; payments</h2><p className="text-[11px] text-slate-500">Click a column heading to sort.</p></header>
        {loading ? <div className="p-6 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div> : visibleRows.length === 0 ? (
          <div className="p-10 text-center"><Users className="w-8 h-8 text-slate-300 mx-auto" /><p className="mt-3 text-sm font-semibold text-slate-800">No students found</p>
            <p className="mt-1 text-xs text-slate-500">{rows.length === 0 ? 'Assign students to a batch (see “Students not in a batch yet” above) or enrol them to see their fees here.' : 'Try clearing the search or filters.'}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left min-w-[860px]">
              <thead><tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-[10px]">
                <SortHead k="student_name" label="Student" />{!grouped && <SortHead k="batch_start" label="Batch" />}
                <SortHead k="net_fee" label="Net fee" right /><SortHead k="paid" label="Paid" right /><SortHead k="outstanding" label="Outstanding" right /><SortHead k="fee_status" label="Status" />
                <th className="py-3 px-3 uppercase tracking-wider font-semibold">Next due</th><th className="py-3 px-3 print:hidden" />
              </tr></thead>
              {grouped ? groups.map((g) => {
                const first = g.rows[0];
                const sum = g.rows.reduce((a, r) => ({ net: a.net + (r.net_fee || 0), paid: a.paid + (r.paid || 0), due: a.due + (r.outstanding || 0) }), { net: 0, paid: 0, due: 0 });
                return (
                  <tbody key={g.key} className="divide-y divide-slate-100 border-t border-slate-200 break-inside-avoid">
                    <tr className="bg-slate-50">
                      <td colSpan={2} className="py-2.5 px-3"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900">{first.batch_name}</span><ModeBadge mode={first.delivery_mode} />
                        <span className="text-[11px] text-slate-500">{first.batch_code || ''}{first.course_name ? ` · ${first.course_name}` : ''} · starts {fmtDate(first.batch_start)} · {g.rows.length} student{g.rows.length === 1 ? '' : 's'}</span></div></td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{money(sum.net)}</td><td className="py-2.5 px-3 text-right tabular-nums font-semibold text-emerald-700">{money(sum.paid)}</td>
                      <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${sum.due > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(sum.due)}</td><td colSpan={3} />
                    </tr>
                    {g.rows.map((r) => <RosterRowView key={r.enrollment_id} r={r} showBatch={false} />)}
                  </tbody>
                );
              }) : <tbody className="divide-y divide-slate-100">{visibleRows.map((r) => <RosterRowView key={r.enrollment_id} r={r} showBatch />)}</tbody>}
              <tfoot><tr className="bg-slate-900 text-white font-semibold">
                <td className="py-3 px-3" colSpan={grouped ? 2 : 2}>Total · {totals.students} students</td>
                <td className="py-3 px-3 text-right tabular-nums">{money(totals.net)}</td><td className="py-3 px-3 text-right tabular-nums">{money(totals.paid)}</td>
                <td className="py-3 px-3 text-right tabular-nums">{money(totals.due)}</td><td colSpan={3} />
              </tr></tfoot>
            </table>
          </div>
        )}
      </section>

      <EnrolModal open={enrolOpen} onClose={() => setEnrolOpen(false)} batches={allBatches.length ? allBatches : batches} courses={courses}
        defaultBatchId={batchId !== 'all' ? batchId : ''} onDone={async (m) => { setEnrolOpen(false); await done(m); }} />
      <PayModal row={payRow} onClose={() => setPayRow(null)} onDone={async (m) => { setPayRow(null); await done(m); }} />
      <HistoryModal row={historyRow} onClose={() => setHistoryRow(null)} onChanged={async (m) => { await done(m); }} />
    </div>
  );
};

const EnrolModal: React.FC<{ open: boolean; onClose: () => void; batches: BatchOverviewRow[]; courses: Array<{ id: string; name: string; fee_amount: number }>; defaultBatchId: string; onDone: (msg: string) => void }> = ({ open, onClose, batches, courses, defaultBatchId, onDone }) => {
  const [students, setStudents] = useState<Array<{ id: string; student_code: string | null; full_name: string; phone: string | null }>>([]);
  const [q, setQ] = useState(''); const [studentId, setStudentId] = useState(''); const [batch, setBatch] = useState('');
  const [fee, setFee] = useState(''); const [discount, setDiscount] = useState('0'); const [due, setDue] = useState(''); const [invoice, setInvoice] = useState(true);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ(''); setStudentId(''); setDiscount('0'); setDue(''); setInvoice(true); setErr(null); setBatch(defaultBatchId);
    feesService.listStudents().then(setStudents).catch((e) => setErr((e as Error).message));
  }, [open, defaultBatchId]);
  useEffect(() => {
    const b = batches.find((x) => x.batch_id === batch);
    const c = courses.find((x) => x.id === b?.course_id);
    setFee(c ? String(c.fee_amount) : '');
  }, [batch, batches, courses]);

  const filtered = students.filter((s) => !q.trim() || `${s.full_name} ${s.student_code || ''} ${s.phone || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 100);
  const net = Math.max((Number(fee) || 0) - (Number(discount) || 0), 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await feesService.enroll({ studentId, batchId: batch, agreedFee: Number(fee) || 0, discount: Number(discount) || 0, dueDate: due, createInvoice: invoice }); onDone('Student enrolled.'); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="Enrol student in a batch" subtitle="Fee defaults to the course fee; adjust if the agreed fee differs" maxWidth="xl">
      <form onSubmit={submit} className="space-y-4 text-sm">
        {err && <div role="alert" className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">{err}</div>}
        <div><label className="block mb-1 font-medium" htmlFor="enrol-batch">Batch *</label>
          <select id="enrol-batch" required value={batch} onChange={(e) => setBatch(e.target.value)} className={input}>
            <option value="">Select batch</option>
            {batches.filter((b) => b.status !== 'cancelled').map((b) => <option key={b.batch_id} value={b.batch_id}>{b.name} · {MODE_LABEL[b.delivery_mode]} · {monthLabel(b.start_date)}{b.seats_left !== null ? ` · ${b.seats_left} seats left` : ''}</option>)}
          </select></div>
        <div><label className="block mb-1 font-medium" htmlFor="enrol-search">Student *</label>
          <input id="enrol-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID or phone" className={`${input} mb-2`} />
          <select required size={5} value={studentId} onChange={(e) => setStudentId(e.target.value)} className={input} aria-label="Student">
            {filtered.map((s) => <option key={s.id} value={s.id}>{s.full_name} — {s.student_code || 'no ID'} {s.phone ? `· ${s.phone}` : ''}</option>)}
          </select>
          {students.length === 0 && <p className="mt-1 text-[11px] text-slate-500">No active students yet. Add the student under Students first.</p>}</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className="block mb-1 font-medium" htmlFor="enrol-fee">Agreed fee (₹)</label><input id="enrol-fee" type="number" min="0" step="1" value={fee} onChange={(e) => setFee(e.target.value)} className={input} /></div>
          <div><label className="block mb-1 font-medium" htmlFor="enrol-disc">Discount (₹)</label><input id="enrol-disc" type="number" min="0" step="1" value={discount} onChange={(e) => setDiscount(e.target.value)} className={input} /></div>
          <div><label className="block mb-1 font-medium" htmlFor="enrol-due">Fee due date</label><input id="enrol-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={input} /></div>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} className="accent-teal-600" />Create the invoice now (net fee {money(net)})</label>
        <div className="flex justify-end gap-2 pt-3 border-t"><button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg cursor-pointer">Cancel</button>
          <button disabled={busy || !studentId || !batch} className="px-4 py-2 bg-slate-900 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer">{busy ? 'Enrolling…' : 'Enrol student'}</button></div>
      </form>
    </Modal>
  );
};

const PayModal: React.FC<{ row: RosterRow | null; onClose: () => void; onDone: (msg: string) => void }> = ({ row, onClose, onDone }) => {
  const [amount, setAmount] = useState(''); const [method, setMethod] = useState<PaymentMethod>('upi'); const [ref, setRef] = useState('');
  const [when, setWhen] = useState(''); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!row) return;
    setAmount(String(row.outstanding ?? '')); setMethod('upi'); setRef(''); setNotes(''); setErr(null);
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); setWhen(d.toISOString().slice(0, 16));
  }, [row]);
  if (!row) return null;
  const due = row.outstanding || 0;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    const n = Number(amount);
    if (!(n > 0)) { setErr('Enter an amount greater than zero.'); return; }
    if (n > due) { setErr(`Amount is more than the outstanding ${money(due)}.`); return; }
    setBusy(true);
    try { await feesService.recordPayment({ enrollmentId: row.enrollment_id, amount: n, method, reference: ref, paidAt: when, notes }); onDone(`Payment of ${money(n)} recorded for ${row.student_name}.`); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={!!row} onClose={onClose} title="Record payment" subtitle={`${row.student_name} · ${row.batch_name}`} maxWidth="md">
      <form onSubmit={submit} className="space-y-4 text-sm">
        {err && <div role="alert" className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">{err}</div>}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 bg-slate-50 rounded-lg"><div className="text-slate-400">Net fee</div><div className="font-bold">{money(row.net_fee)}</div></div>
          <div className="p-2 bg-slate-50 rounded-lg"><div className="text-slate-400">Paid</div><div className="font-bold text-emerald-700">{money(row.paid)}</div></div>
          <div className="p-2 bg-rose-50 rounded-lg"><div className="text-rose-400">Outstanding</div><div className="font-bold text-rose-600">{money(due)}</div></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="block mb-1 font-medium" htmlFor="pay-amt">Amount (₹) *</label><input id="pay-amt" required type="number" min="1" step="0.01" max={due} value={amount} onChange={(e) => setAmount(e.target.value)} className={input} /></div>
          <div><label className="block mb-1 font-medium" htmlFor="pay-method">Method *</label>
            <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={input}>{METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></div>
          <div><label className="block mb-1 font-medium" htmlFor="pay-ref">Transaction reference</label><input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="UPI / cheque / receipt no." className={input} /></div>
          <div><label className="block mb-1 font-medium" htmlFor="pay-when">Received on</label><input id="pay-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={input} /></div>
        </div>
        <div><label className="block mb-1 font-medium" htmlFor="pay-notes">Notes</label><input id="pay-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} /></div>
        <div className="flex justify-end gap-2 pt-3 border-t"><button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg cursor-pointer">Cancel</button>
          <button disabled={busy} className="px-4 py-2 bg-teal-700 text-white font-semibold rounded-lg disabled:opacity-50 cursor-pointer">{busy ? 'Saving…' : 'Save payment'}</button></div>
      </form>
    </Modal>
  );
};

const HistoryModal: React.FC<{ row: RosterRow | null; onClose: () => void; onChanged: (msg: string) => void }> = ({ row, onClose, onChanged }) => {
  const [list, setList] = useState<PaymentRow[]>([]); const [loading, setLoading] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [revId, setRevId] = useState<string | null>(null); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!row) return; setLoading(true); setErr(null);
    try { setList(await feesService.payments(row.enrollment_id)); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [row]);
  useEffect(() => { setRevId(null); setReason(''); void load(); }, [load]);
  if (!row) return null;
  const reverse = async () => {
    if (!revId || reason.trim().length < 3) { setErr('Give a short reason for the reversal.'); return; }
    setBusy(true); setErr(null);
    try { await feesService.reversePayment(revId, reason.trim()); setRevId(null); setReason(''); await load(); onChanged('Payment reversed. The original entry is kept for the audit trail.'); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen={!!row} onClose={onClose} title="Payment history" subtitle={`${row.student_name} · ${row.batch_name} · outstanding ${money(row.outstanding)}`} maxWidth="2xl">
      {err && <div role="alert" className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg">{err}</div>}
      {loading ? <div className="h-24 bg-slate-100 rounded animate-pulse" /> : list.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No payments recorded yet.</p> : (
        <ul className="divide-y divide-slate-100">
          {list.map((p) => (
            <li key={p.id} className="py-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex-1 min-w-48">
                <div className="flex items-center gap-2"><span className={`font-bold tabular-nums ${p.entry_type === 'reversal' ? 'text-rose-600' : p.is_reversed ? 'text-slate-400 line-through' : 'text-emerald-700'}`}>{p.entry_type === 'reversal' ? '−' : ''}{money(p.amount)}</span>
                  {p.entry_type === 'reversal' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">Reversal</span>}
                  {p.is_reversed && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Reversed</span>}</div>
                <div className="text-[11px] text-slate-500">{fmtDate(p.payment_date)} · {p.method.replace('_', ' ')}{p.reference_number ? ` · ${p.reference_number}` : ''} · {p.invoice_number}{p.reversal_reason ? ` · Reason: ${p.reversal_reason}` : ''}{p.notes ? ` · ${p.notes}` : ''}</div>
              </div>
              {p.entry_type === 'payment' && !p.is_reversed && (revId === p.id ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for reversal" aria-label="Reason for reversal" className="px-2 py-1.5 border border-slate-300 rounded-md text-xs flex-1 min-w-40" />
                  <button type="button" disabled={busy} onClick={() => void reverse()} className="px-3 py-1.5 bg-rose-600 text-white text-xs font-semibold rounded-md disabled:opacity-50 cursor-pointer">Confirm</button>
                  <button type="button" onClick={() => { setRevId(null); setReason(''); }} className="text-xs text-slate-500 cursor-pointer">Cancel</button>
                </div>
              ) : <button type="button" onClick={() => setRevId(p.id)} className="px-2.5 py-1.5 text-xs text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-md cursor-pointer">Reverse</button>)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[11px] text-slate-400">Payments are never deleted. A mistake is corrected with a reversal that stays on record.</p>
    </Modal>
  );
};
