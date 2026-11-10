import React, { useCallback, useEffect, useState } from 'react';
import { Search, Plus, RefreshCw, Users, AlertCircle } from 'lucide-react';
import { getSupabaseClient } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../common/Modal';

type Student = {
  id: string; student_code: string | null; full_name: string; email: string | null;
  phone: string; whatsapp: string | null; admission_date: string; status: string;
  created_at: string;
};

export const StudentsView: React.FC<{ onManageFees?: (studentId: string) => void }> = ({ onManageFees }) => {
  const { user, role } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  const canManage = role === 'super_admin' || role === 'admin';

  const loadStudents = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) { setError('Supabase is not configured. Check the production environment variables.'); setLoading(false); return; }
    setLoading(true); setError('');
    const { data, error: queryError } = await client.from('students')
      .select('id, student_code, full_name, email, phone, whatsapp, admission_date, status, created_at')
      .order('created_at', { ascending: false }).limit(500);
    if (queryError) {
      setError(queryError.code === 'PGRST205' || queryError.message.includes('schema cache')
        ? 'The student tables were not found in the connected Supabase project. Confirm VITE_SUPABASE_URL points to global-chinar-crm.'
        : queryError.message);
      setStudents([]);
    } else setStudents((data || []) as Student[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadStudents(); }, [loadStudents]);

  const addStudent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !user || !name.trim() || !phone.trim()) return;
    const client = getSupabaseClient();
    if (!client) return;
    setSaving(true); setError('');
    const { error: insertError } = await client.from('students').insert([{
      full_name: name.trim(), phone: phone.trim(), email: email.trim() || null,
      whatsapp: whatsapp.trim() || null, created_by: user.id,
    }]);
    setSaving(false);
    if (insertError) { setError(insertError.message); return; }
    setModalOpen(false); setName(''); setPhone(''); setEmail(''); setWhatsapp('');
    await loadStudents();
  };

  const visible = students.filter(s => [s.full_name, s.phone, s.email || '', s.student_code || '']
    .some(v => v.toLowerCase().includes(search.toLowerCase())));

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Academic operations</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Student Management</h1>
        <p className="mt-1 text-sm text-slate-500">Maintain student profiles, admission details and contact information.</p></div>
      <div className="flex gap-2">
        <button onClick={() => void loadStudents()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Refresh</button>
        {canManage && <button onClick={() => setModalOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Plus className="h-4 w-4"/>Add student</button>}
      </div>
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="text-sm text-slate-500">Total students</span><Users className="h-5 w-5 text-teal-700"/></div><p className="mt-3 text-3xl font-bold text-slate-900">{students.length}</p><p className="mt-1 text-xs text-slate-400">Records available to your role</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-5"><span className="text-sm text-slate-500">Active students</span><p className="mt-3 text-3xl font-bold text-emerald-700">{students.filter(s => s.status === 'active').length}</p><p className="mt-1 text-xs text-slate-400">Currently enrolled</p></div>
      <div className="rounded-xl border border-slate-200 bg-white p-5"><span className="text-sm text-slate-500">Completed</span><p className="mt-3 text-3xl font-bold text-slate-900">{students.filter(s => s.status === 'completed').length}</p><p className="mt-1 text-xs text-slate-400">Course completed</p></div>
    </div>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-slate-900">Student directory</h2><p className="text-xs text-slate-500">Search and manage registered students</p></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or email" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-600 sm:w-72"/></div></div>
      {error && <div className="m-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertCircle className="h-5 w-5 shrink-0"/><span>{error}</span></div>}
      {loading ? <p className="p-10 text-center text-sm text-slate-500">Loading student records…</p> : !error && visible.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No student records found. Add the first student to get started.</p> : !error && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Admission date</th><th className="px-5 py-3">Status</th>{canManage && onManageFees && <th className="px-5 py-3 text-right">Fees</th>}</tr></thead><tbody className="divide-y divide-slate-100">{visible.map(s => <tr key={s.id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{s.full_name}</p><p className="text-xs text-slate-400">{s.student_code || 'Student ID pending'}</p></td><td className="px-5 py-4"><p>{s.phone}</p><p className="text-xs text-slate-400">{s.email || s.whatsapp || '—'}</p></td><td className="px-5 py-4 text-slate-600">{s.admission_date ? new Date(s.admission_date).toLocaleDateString() : '—'}</td><td className="px-5 py-4"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium capitalize text-emerald-700">{s.status}</span></td>{canManage && onManageFees && <td className="px-5 py-4 text-right"><button type="button" onClick={() => onManageFees(s.id)} className="rounded-md border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 cursor-pointer">Manage fees</button></td>}</tr>)}</tbody></table></div>}
    </section>
    <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add student" subtitle="Create an internal student record" maxWidth="2xl">
      <form onSubmit={addStudent} className="space-y-4"><div><label className="mb-1 block text-sm font-medium">Full name *</label><input required value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></div><div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-1 block text-sm font-medium">Phone *</label><input required value={phone} onChange={e=>setPhone(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></div><div><label className="mb-1 block text-sm font-medium">WhatsApp</label><input value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></div></div><div><label className="mb-1 block text-sm font-medium">Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={()=>setModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save student'}</button></div></form>
    </Modal>
  </div>;
};
