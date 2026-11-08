import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Plus, RefreshCw, Users, Clock, MapPin, Video, Pencil, X } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../common/Modal';
import { feesService, money, fmtDate, monthLabel, MODE_LABEL, type BatchOverviewRow, type DeliveryMode } from '../../services/feesService';

type BatchStatus = 'planned' | 'ongoing' | 'completed' | 'cancelled';
interface BatchExtra { id: string; schedule_text: string | null; room_or_link: string | null; notes: string | null }
interface Course { id: string; name: string }
interface Trainer { id: string; full_name: string | null; email: string }
interface Form { name: string; code: string; course_id: string; delivery_mode: DeliveryMode; start_date: string; end_date: string; schedule_text: string; capacity: string; room_or_link: string; status: BatchStatus; notes: string }

const EMPTY: Form = { name: '', code: '', course_id: '', delivery_mode: 'offline', start_date: '', end_date: '', schedule_text: '', capacity: '', room_or_link: '', status: 'planned', notes: '' };
const STATUS_STYLE: Record<string, string> = {
  ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-200', completed: 'bg-slate-100 text-slate-600 border-slate-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200', planned: 'bg-amber-50 text-amber-800 border-amber-200',
};
const MODE_STYLE: Record<DeliveryMode, string> = {
  online: 'bg-sky-50 text-sky-700 border-sky-200', offline: 'bg-amber-50 text-amber-800 border-amber-200', hybrid: 'bg-violet-50 text-violet-700 border-violet-200',
};
const field = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600';
const sel = 'px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 bg-white focus:outline-hidden focus:ring-2 focus:ring-teal-600';

export const BatchesView: React.FC = () => {
  const { profile, user, role } = useAuth();
  const admin = role === 'super_admin' || role === 'admin';

  const [items, setItems] = useState<BatchOverviewRow[]>([]);
  const [extra, setExtra] = useState<Record<string, BatchExtra>>({});
  const [courses, setCourses] = useState<Course[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [modeFilter, setModeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [month, setMonth] = useState('');

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [assigned, setAssigned] = useState<Trainer[]>([]);
  const [addTrainer, setAddTrainer] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const db = getSupabaseClient();
    if (!db) { setError('Supabase is not configured.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [overview, extras, courseRes, trainerRes] = await Promise.all([
        feesService.overview({}),
        db.from('school_batches').select('id,schedule_text,room_or_link,notes'),
        db.from('school_courses').select('id,name').eq('is_active', true).order('name'),
        admin ? db.from('profiles').select('id,full_name,email').eq('role', 'trainer').eq('is_active', true).order('full_name') : Promise.resolve({ data: [], error: null }),
      ]);
      setItems(overview);
      setExtra(Object.fromEntries(((extras.data || []) as BatchExtra[]).map((x) => [x.id, x])));
      setCourses((courseRes.data || []) as Course[]);
      setTrainers((trainerRes.data || []) as Trainer[]);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [admin]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => items.filter((b) =>
    (modeFilter === 'all' || b.delivery_mode === modeFilter) && (statusFilter === 'all' || b.status === statusFilter) &&
    (!month || (b.start_date || '').slice(0, 7) === month)), [items, modeFilter, statusFilter, month]);

  const groups = useMemo(() => {
    const map = new Map<string, BatchOverviewRow[]>();
    visible.forEach((b) => { const k = b.start_date ? b.start_date.slice(0, 7) : 'none'; map.set(k, [...(map.get(k) || []), b]); });
    return [...map.entries()].sort((a, b) => (a[0] === 'none' ? 1 : b[0] === 'none' ? -1 : b[0].localeCompare(a[0])));
  }, [visible]);

  const loadAssigned = async (batchId: string) => {
    const db = getSupabaseClient(); if (!db) return;
    const { data } = await db.from('batch_trainers').select('trainer_id, profiles(id,full_name,email)').eq('batch_id', batchId);
    setAssigned(((data || []) as unknown as Array<{ profiles: Trainer | null }>).map((r) => r.profiles).filter((p): p is Trainer => !!p));
  };

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setAssigned([]); setAddTrainer(''); setOpen(true); };
  const openEdit = async (b: BatchOverviewRow) => {
    const x = extra[b.batch_id];
    setEditingId(b.batch_id);
    setForm({ name: b.name, code: b.code || '', course_id: b.course_id || '', delivery_mode: b.delivery_mode, start_date: b.start_date || '', end_date: b.end_date || '',
      schedule_text: x?.schedule_text || '', capacity: b.capacity ? String(b.capacity) : '', room_or_link: x?.room_or_link || '', status: b.status as BatchStatus, notes: x?.notes || '' });
    setAddTrainer(''); setAssigned([]); setOpen(true);
    await loadAssigned(b.batch_id);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const db = getSupabaseClient(); if (!admin || !user || !db) return;
    if (form.start_date && form.end_date && form.end_date < form.start_date) { setError('End date cannot be before the start date.'); return; }
    setSaving(true); setError('');
    const payload = {
      name: form.name.trim(), code: form.code.trim() || null, course_id: form.course_id || null, delivery_mode: form.delivery_mode,
      start_date: form.start_date || null, end_date: form.end_date || null, schedule_text: form.schedule_text.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null, room_or_link: form.room_or_link.trim() || null, status: form.status, notes: form.notes.trim() || null,
    };
    const res = editingId
      ? await db.from('school_batches').update(payload).eq('id', editingId).select('id').single()
      : await db.from('school_batches').insert({ ...payload, created_by: user.id }).select('id').single();
    if (res.error) { setSaving(false); setError(res.error.message.includes('duplicate') ? 'That batch code is already in use.' : res.error.message); return; }
    if (!editingId && addTrainer) {
      const { error: te } = await db.from('batch_trainers').insert({ batch_id: res.data.id, trainer_id: addTrainer, assigned_by: user.id });
      if (te) { setSaving(false); setError(`Batch saved, but the trainer could not be assigned: ${te.message}`); await load(); return; }
    }
    setSaving(false); setOpen(false); setNotice(editingId ? 'Batch updated.' : 'Batch created.'); await load();
  };

  const trainerChange = async (add: boolean, id: string) => {
    const db = getSupabaseClient(); if (!db || !editingId || !user) return;
    const res = add ? await db.from('batch_trainers').insert({ batch_id: editingId, trainer_id: id, assigned_by: user.id })
                    : await db.from('batch_trainers').delete().eq('batch_id', editingId).eq('trainer_id', id);
    if (res.error) { setError(res.error.message); return; }
    setAddTrainer(''); await loadAssigned(editingId); await load();
  };

  const changeStatus = async (b: BatchOverviewRow, status: BatchStatus) => {
    const db = getSupabaseClient(); if (!db) return;
    if (status === 'cancelled' && !window.confirm(`Cancel "${b.name}"? Enrolled students and their fees are kept.`)) return;
    const { error: e } = await db.from('school_batches').update({ status }).eq('id', b.batch_id);
    if (e) setError(e.message); else await load();
  };

  const stat = (label: string, value: number, cls = 'text-slate-900') => (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"><p className={`text-2xl font-bold ${cls}`}>{value}</p><p className="text-xs text-slate-500">{label}</p></div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Academic operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{admin ? 'Batch Management' : 'My Teaching Batches'}</h1>
          <p className="mt-1 text-sm text-slate-500">{admin ? 'Monthly online and offline batches, trainers and seat availability.' : `Assigned batches for ${profile?.full_name || 'trainer'}.`}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm cursor-pointer"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          {admin && <button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white cursor-pointer"><Plus className="h-4 w-4" />Create batch</button>}
        </div>
      </div>

      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex justify-between"><span>{notice}</span><button type="button" onClick={() => setNotice('')} className="underline font-semibold cursor-pointer">Dismiss</button></div>}
      {error && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stat('Batches shown', visible.length)}
        {stat('Online', visible.filter((b) => b.delivery_mode === 'online').length, 'text-sky-700')}
        {stat('Offline', visible.filter((b) => b.delivery_mode === 'offline').length, 'text-amber-700')}
        {stat('Students enrolled', visible.reduce((n, b) => n + b.enrolled, 0), 'text-teal-700')}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Mode" value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} className={sel}><option value="all">All modes</option><option value="online">Online</option><option value="offline">Offline</option><option value="hybrid">Hybrid</option></select>
        <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={sel}><option value="all">All statuses</option><option value="planned">Planned</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
        <input aria-label="Starting month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={sel} />
        {(modeFilter !== 'all' || statusFilter !== 'all' || month) && <button type="button" onClick={() => { setModeFilter('all'); setStatusFilter('all'); setMonth(''); }} className="text-xs text-teal-700 hover:underline cursor-pointer">Clear filters</button>}
      </div>

      {loading ? <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-48 rounded-xl bg-slate-100 animate-pulse" />)}</div> : visible.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center"><CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
          <h3 className="mt-3 font-semibold text-slate-800">{items.length === 0 ? 'No batches yet' : 'No batches match these filters'}</h3>
          <p className="mt-1 text-sm text-slate-500">{items.length === 0 ? (admin ? 'Create this month’s online and offline batches to start enrolling students.' : 'No batches have been assigned to you yet.') : 'Try clearing the filters.'}</p></div>
      ) : groups.map(([key, list]) => (
        <section key={key} className="space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2"><span className="w-1 h-3 rounded-full bg-gradient-to-b from-amber-500 to-teal-600" />{key === 'none' ? 'Start date not set' : monthLabel(`${key}-01`)} · {list.length} batch{list.length === 1 ? '' : 'es'}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((b) => {
              const x = extra[b.batch_id];
              const isLink = /^https?:\/\//i.test(x?.room_or_link || '');
              return (
                <article key={b.batch_id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-teal-700">{b.code || 'BATCH'}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${MODE_STYLE[b.delivery_mode]}`}>{MODE_LABEL[b.delivery_mode]}</span></div>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900 truncate">{b.name}</h3>
                      <p className="text-sm text-slate-500">{b.course_name || 'Course not linked'}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLE[b.status] || ''}`}>{b.status}</span>
                  </div>
                  <div className="mt-4 grid gap-2.5 border-t pt-4 text-sm text-slate-600 sm:grid-cols-2">
                    <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />{fmtDate(b.start_date)}{b.end_date ? ` – ${fmtDate(b.end_date)}` : ''}</p>
                    <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400 shrink-0" />{x?.schedule_text || 'Schedule pending'}</p>
                    <p className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-400 shrink-0" /><span><strong className="text-slate-900">{b.enrolled}</strong>{b.capacity ? ` of ${b.capacity} seats` : ' enrolled'}{b.seats_left !== null ? <span className={b.seats_left === 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}> · {b.seats_left === 0 ? 'Full' : `${b.seats_left} left`}</span> : null}</span></p>
                    <p className="flex items-center gap-2 min-w-0">{b.delivery_mode === 'online' ? <Video className="h-4 w-4 text-slate-400 shrink-0" /> : <MapPin className="h-4 w-4 text-slate-400 shrink-0" />}
                      {isLink ? <a href={x!.room_or_link!} target="_blank" rel="noopener noreferrer" className="truncate text-teal-700 hover:underline">Join link</a> : <span className="truncate">{x?.room_or_link || (b.delivery_mode === 'online' ? 'Meeting link pending' : 'Venue pending')}</span>}</p>
                    <p className="sm:col-span-2 text-xs text-slate-500">Trainer{(b.trainer_names || '').includes(',') ? 's' : ''}: <span className="font-medium text-slate-700">{b.trainer_names || 'Not assigned'}</span></p>
                  </div>
                  {admin && b.net_fee_total !== null && (
                    <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center text-xs">
                      <div><div className="text-slate-400">Total fees</div><div className="font-bold text-slate-900">{money(b.net_fee_total)}</div></div>
                      <div><div className="text-slate-400">Collected</div><div className="font-bold text-emerald-700">{money(b.collected)}</div></div>
                      <div><div className="text-slate-400">Outstanding</div><div className={`font-bold ${(b.outstanding || 0) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{money(b.outstanding)}</div></div>
                    </div>
                  )}
                  {admin && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                      <button type="button" onClick={() => void openEdit(b)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 cursor-pointer"><Pencil className="h-3 w-3" />Edit</button>
                      {(['planned', 'ongoing', 'completed', 'cancelled'] as const).filter((s) => s !== b.status).map((s) => (
                        <button key={s} type="button" onClick={() => void changeStatus(b, s)} className="rounded-md border px-2.5 py-1.5 text-xs capitalize hover:bg-slate-50 cursor-pointer">Mark {s}</button>))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editingId ? 'Edit batch' : 'Create training batch'} subtitle="Monthly cohort, delivery mode, schedule and trainers" maxWidth="2xl">
        <form onSubmit={save} className="space-y-4 text-sm">
          <div><label className="mb-1 block font-medium" htmlFor="b-name">Batch name *</label><input id="b-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Digital Marketing — November 2026 (Online)" className={field} /></div>
          <fieldset><legend className="mb-1 font-medium">Delivery mode *</legend>
            <div className="grid grid-cols-3 gap-2">{(['offline', 'online', 'hybrid'] as const).map((m) => (
              <label key={m} className={`cursor-pointer rounded-lg border-2 px-3 py-2 text-center text-sm font-medium ${form.delivery_mode === m ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600'}`}>
                <input type="radio" name="mode" value={m} checked={form.delivery_mode === m} onChange={() => setForm({ ...form, delivery_mode: m })} className="sr-only" />{MODE_LABEL[m]}</label>))}</div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1 block font-medium" htmlFor="b-code">Batch code</label><input id="b-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DM-NOV26-ON" className={field} /></div>
            <div><label className="mb-1 block font-medium" htmlFor="b-course">Course</label><select id="b-course" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })} className={field}><option value="">Select course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="mb-1 block font-medium" htmlFor="b-start">Start date</label><input id="b-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={field} /></div>
            <div><label className="mb-1 block font-medium" htmlFor="b-end">End date</label><input id="b-end" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={field} /></div>
            <div><label className="mb-1 block font-medium" htmlFor="b-sched">Schedule</label><input id="b-sched" value={form.schedule_text} onChange={(e) => setForm({ ...form, schedule_text: e.target.value })} placeholder="Mon, Wed, Fri · 8:30 PM" className={field} /></div>
            <div><label className="mb-1 block font-medium" htmlFor="b-cap">Capacity (seats)</label><input id="b-cap" type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className={field} /></div>
          </div>
          <div><label className="mb-1 block font-medium" htmlFor="b-room">{form.delivery_mode === 'online' ? 'Meeting link' : form.delivery_mode === 'offline' ? 'Classroom / venue' : 'Classroom and meeting link'}</label>
            <input id="b-room" value={form.room_or_link} onChange={(e) => setForm({ ...form, room_or_link: e.target.value })} className={field} /></div>
          {editingId && <div><label className="mb-1 block font-medium" htmlFor="b-status">Status</label><select id="b-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BatchStatus })} className={field}><option value="planned">Planned</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>}
          <div>
            <label className="mb-1 block font-medium" htmlFor="b-trainer">Trainers</label>
            {editingId && assigned.length > 0 && <ul className="mb-2 flex flex-wrap gap-2">{assigned.map((t) => (
              <li key={t.id} className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs text-teal-800">{t.full_name || t.email}
                <button type="button" aria-label={`Remove ${t.full_name || t.email}`} onClick={() => void trainerChange(false, t.id)} className="cursor-pointer"><X className="h-3 w-3" /></button></li>))}</ul>}
            <div className="flex gap-2">
              <select id="b-trainer" value={addTrainer} onChange={(e) => setAddTrainer(e.target.value)} className={field}><option value="">{editingId ? 'Add a trainer…' : 'Assign a trainer (more can be added after saving)'}</option>
                {trainers.filter((t) => !assigned.some((a) => a.id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}</select>
              {editingId && <button type="button" disabled={!addTrainer} onClick={() => void trainerChange(true, addTrainer)} className="rounded-lg border px-3 text-sm font-medium disabled:opacity-50 cursor-pointer">Add</button>}
            </div>
            {trainers.length === 0 && <p className="mt-1 text-[11px] text-slate-400">No trainer accounts yet. Create trainer logins under Staff &amp; Team.</p>}
          </div>
          <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm cursor-pointer">Cancel</button>
            <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create batch'}</button></div>
        </form>
      </Modal>
    </div>
  );
};
