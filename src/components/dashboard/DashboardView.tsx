import React, { useCallback, useEffect, useState } from 'react';
import {
  Users, UserPlus, PhoneCall, Clock, AlertTriangle, Award, CheckCircle2, GraduationCap, UserCheck, Layers,
  CalendarCheck, CalendarDays, ClipboardCheck, IndianRupee, Wallet, RefreshCw, AlertCircle, ArrowUpRight, Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { dashboardService } from '../../services/dashboardService';
import { leadService } from '../../services/leadService';
import type { DashboardOverview } from '../../types/dashboard';
import { RoleBadge, StatusBadge, PriorityBadge } from '../common/Badge';
import type { NavTab } from '../layout/Sidebar';

interface DashboardViewProps {
  onViewLeadById: (leadId: string) => void;
  onNavigate: (tab: NavTab) => void;
}

const TZ = 'Asia/Kolkata';
const money = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

type Tone = 'teal' | 'gold' | 'slate' | 'rose' | 'indigo';
const TONES: Record<Tone, { icon: string; value: string }> = {
  teal: { icon: 'bg-teal-50 text-teal-700', value: 'text-teal-800' },
  gold: { icon: 'bg-amber-50 text-amber-700', value: 'text-amber-800' },
  slate: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
  rose: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-700' },
  indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-indigo-700' },
};

const Kpi: React.FC<{ label: string; value: React.ReactNode; hint?: string; icon: React.ElementType; tone?: Tone; loading: boolean; onClick?: () => void }> = ({ label, value, hint, icon: Icon, tone = 'slate', loading, onClick }) => {
  const t = TONES[tone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">{label}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.icon}`}><Icon className="w-4 h-4" /></span>
      </div>
      {loading ? <div className="mt-3 h-7 w-16 rounded bg-slate-100 animate-pulse" /> : <div className={`mt-2 text-2xl font-bold tracking-tight ${t.value}`}>{value}</div>}
      {hint && !loading && <div className="mt-0.5 text-[11px] text-slate-400 truncate">{hint}</div>}
    </>
  );
  const cls = 'text-left bg-white border border-slate-200 rounded-xl p-4 shadow-xs';
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} hover:border-teal-300 hover:shadow-sm transition cursor-pointer w-full`}>{body}</button>
    : <div className={cls}>{body}</div>;
};

const Card: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, subtitle, action, children, className = '' }) => (
  <section className={`bg-white border border-slate-200 rounded-xl shadow-xs flex flex-col ${className}`}>
    <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </header>
    <div className="p-5 flex-1">{children}</div>
  </section>
);

const Empty: React.FC<{ icon: React.ElementType; title: string; text: string }> = ({ icon: Icon, title, text }) => (
  <div className="flex flex-col items-center justify-center text-center py-8">
    <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3"><Icon className="w-5 h-5" /></span>
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    <p className="text-xs text-slate-500 mt-1 max-w-xs">{text}</p>
  </div>
);

const Skeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />)}</div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
    <span className="w-1 h-3 rounded-full bg-gradient-to-b from-amber-500 to-teal-600" />{children}
  </h2>
);

const Bar: React.FC<{ label: string; value: number; max: number; color?: string; suffix?: string }> = ({ label, value, max, color = 'bg-teal-600', suffix }) => (
  <div>
    <div className="flex justify-between text-xs mb-1"><span className="text-slate-700 truncate pr-2">{label}</span><span className="font-semibold text-slate-900 tabular-nums">{value}{suffix}</span></div>
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${max > 0 ? Math.max(3, (value / max) * 100) : 0}%` }} /></div>
  </div>
);

export const DashboardView: React.FC<DashboardViewProps> = ({ onViewLeadById, onNavigate }) => {
  const { profile, user, role } = useAuth();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await dashboardService.getOverview();
    if (res.error) setError(res.error.message);
    else setData(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const completeFollowUp = async (id: string) => {
    setCompleting(id);
    const { error: err } = await leadService.updateFollowUpStatus(id, 'completed', 'Completed from dashboard');
    setCompleting(null);
    if (err) setError(err.message); else void load();
  };

  const isAdmin = role === 'super_admin' || role === 'admin';
  const canSeeLeads = role !== 'trainer';
  const d = data;
  const att = d?.attendance_today;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  const name = profile?.full_name || user?.email?.split('@')[0] || 'there';
  const leadTotal = d?.leads.total ?? 0;
  const funnelMax = Math.max(leadTotal, 1);
  const engaged = d ? d.leads.contacted + d.leads.follow_up + d.leads.qualified + d.leads.converted : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Welcome back, {name}</h1>
            <RoleBadge role={role || 'employee'} />
          </div>
          <p className="text-xs text-slate-500 mt-1">{today}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} title="Refresh figures"
          className="inline-flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition cursor-pointer disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="flex-1">Could not load the latest figures: {error}</span>
          <button type="button" onClick={() => void load()} className="font-semibold underline cursor-pointer">Retry</button>
        </div>
      )}

      {canSeeLeads && (
        <div>
          <SectionTitle>Admissions pipeline</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Kpi label="Total leads" value={d?.leads.total} icon={Users} loading={loading} onClick={() => onNavigate('leads')} />
            <Kpi label="New" value={d?.leads.new} icon={UserPlus} tone="indigo" loading={loading} />
            <Kpi label="Contacted" value={d?.leads.contacted} icon={PhoneCall} tone="teal" loading={loading} />
            <Kpi label="Qualified" value={d?.leads.qualified} icon={Award} tone="gold" loading={loading} />
            <Kpi label="Converted" value={d?.leads.converted} icon={CheckCircle2} tone="teal" loading={loading} />
            <Kpi label="Follow-ups today" value={d?.followups.due_today} icon={Clock} tone="gold" loading={loading} />
            <Kpi label="Overdue follow-ups" value={d?.followups.overdue} icon={AlertTriangle} tone={d && d.followups.overdue > 0 ? 'rose' : 'slate'} loading={loading} />
          </div>
        </div>
      )}

      <div>
        <SectionTitle>School operations</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label="Total students" value={d?.students.total} icon={GraduationCap} loading={loading} />
          <Kpi label="Active students" value={d?.students.active} icon={UserCheck} tone="teal" loading={loading} />
          <Kpi label="Active courses" value={d?.courses_active} icon={Layers} tone="gold" loading={loading} />
          <Kpi label="Active batches" value={d?.batches_active} icon={CalendarCheck} tone="teal" loading={loading} />
          <Kpi label="Today's classes" value={d?.classes_today} icon={CalendarDays} tone="indigo" loading={loading} />
          <Kpi label="Today's attendance" value={att && att.marked > 0 ? `${pct(att.present + att.late, att.marked)}%` : '—'}
            hint={att && att.marked > 0 ? `${att.present + att.late} of ${att.marked} present` : 'Not marked yet'} icon={ClipboardCheck} tone="teal" loading={loading} />
        </div>
      </div>

      {isAdmin && (
        <div>
          <SectionTitle>Finance</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Kpi label="Fees collected" value={money(d?.fees?.collected_total ?? 0)} hint="All time, net of reversals" icon={IndianRupee} tone="teal" loading={loading} />
            <Kpi label="Collected this month" value={money(d?.fees?.collected_month ?? 0)} icon={Wallet} tone="gold" loading={loading} />
            <Kpi label="Outstanding fees" value={money(d?.fees?.outstanding ?? 0)} hint="Open invoices" icon={AlertTriangle} tone={d?.fees && d.fees.outstanding > 0 ? 'rose' : 'slate'} loading={loading} />
          </div>
        </div>
      )}

      {canSeeLeads && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <Card className="xl:col-span-7" title="Recent leads" subtitle="Newest enquiries in your pipeline"
            action={<button type="button" onClick={() => onNavigate('leads')} className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 cursor-pointer">View all <ArrowUpRight className="w-3.5 h-3.5" /></button>}>
            {loading ? <Skeleton /> : !d || d.recent_leads.length === 0 ? (
              <Empty icon={Users} title="No leads yet" text="Leads added manually or synced from Google Sheets will appear here." />
            ) : (
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-xs min-w-[560px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 pb-2 font-semibold">Lead</th><th className="pb-2 font-semibold">Course</th><th className="pb-2 font-semibold">Status</th><th className="pb-2 font-semibold">Priority</th><th className="pr-5 pb-2 font-semibold text-right">Added</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.recent_leads.map((l) => (
                      <tr key={l.id} onClick={() => onViewLeadById(l.id)} className="hover:bg-slate-50 cursor-pointer">
                        <td className="px-5 py-2.5"><div className="font-semibold text-slate-900">{l.full_name}</div><div className="text-[11px] text-slate-400">{l.phone || l.email || '—'}{l.assigned_name ? ` · ${l.assigned_name}` : ''}</div></td>
                        <td className="py-2.5 text-slate-600">{l.interested_course || 'Not specified'}</td>
                        <td className="py-2.5"><StatusBadge status={l.status} /></td>
                        <td className="py-2.5"><PriorityBadge priority={l.priority} /></td>
                        <td className="pr-5 py-2.5 text-right text-slate-500 whitespace-nowrap">{fmtDate(l.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="xl:col-span-5" title="Upcoming follow-ups" subtitle="Pending calls and visits, oldest first"
            action={d && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">{d.upcoming_followups.length} shown</span>}>
            {loading ? <Skeleton /> : !d || d.upcoming_followups.length === 0 ? (
              <Empty icon={Clock} title="Nothing pending" text="Scheduled follow-ups will be listed here, with overdue ones first." />
            ) : (
              <ul className="space-y-2">
                {d.upcoming_followups.map((f) => (
                  <li key={f.id} className={`flex items-center gap-3 p-3 rounded-lg border ${f.is_overdue ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'}`}>
                    <button type="button" onClick={() => onViewLeadById(f.lead_id)} className="flex-1 min-w-0 text-left cursor-pointer">
                      <div className="text-xs font-semibold text-slate-900 truncate">{f.lead_name}</div>
                      <div className={`text-[11px] ${f.is_overdue ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>{f.is_overdue ? 'Overdue · ' : ''}{fmtDateTime(f.scheduled_at)}{f.follow_up_type ? ` · ${f.follow_up_type}` : ''}</div>
                    </button>
                    <button type="button" onClick={() => void completeFollowUp(f.id)} disabled={completing === f.id} title="Mark completed"
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md cursor-pointer disabled:opacity-50">
                      <Check className="w-3.5 h-3.5" /> Done
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {canSeeLeads && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Lead source breakdown" subtitle="Where enquiries come from">
            {loading ? <Skeleton rows={3} /> : !d || d.lead_sources.length === 0 ? (
              <Empty icon={Users} title="No source data" text="Source is recorded on each lead." />
            ) : (
              <div className="space-y-3">{d.lead_sources.map((s) => <Bar key={s.source} label={s.source} value={s.count} max={d.lead_sources[0].count} />)}</div>
            )}
          </Card>
          <Card title="Admission conversion overview" subtitle="How leads move toward admission">
            {loading ? <Skeleton rows={3} /> : !d || leadTotal === 0 ? (
              <Empty icon={Award} title="No conversions to show" text="Conversion figures appear once leads are in the pipeline." />
            ) : (
              <div className="space-y-3">
                <Bar label="All leads" value={leadTotal} max={funnelMax} color="bg-slate-400" />
                <Bar label="Engaged (contacted or further)" value={engaged} max={funnelMax} color="bg-teal-500" />
                <Bar label="Qualified or converted" value={d.leads.qualified + d.leads.converted} max={funnelMax} color="bg-amber-500" />
                <Bar label="Converted" value={d.leads.converted} max={funnelMax} color="bg-emerald-600" />
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">Conversion rate</span><span className="font-bold text-slate-900">{pct(d.leads.converted, leadTotal)}%</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Admissions in the last 30 days</span><span className="font-bold text-slate-900">{d.admissions_30d}</span>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <div className={`grid grid-cols-1 ${isAdmin ? 'xl:grid-cols-3' : 'lg:grid-cols-2'} gap-6`}>
        {canSeeLeads && (
          <Card title="Recent admissions" subtitle="Newly admitted students">
            {loading ? <Skeleton rows={3} /> : !d || d.recent_admissions.length === 0 ? (
              <Empty icon={GraduationCap} title="No admissions yet" text="Students appear here after a lead is admitted." />
            ) : (
              <ul className="divide-y divide-slate-100">{d.recent_admissions.map((s) => (
                <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="text-xs font-semibold text-slate-900 truncate">{s.full_name}</div><div className="text-[11px] text-slate-400 truncate">{s.student_code || '—'}{s.course_name ? ` · ${s.course_name}` : ''}</div></div>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">{fmtDate(s.admission_date)}</span>
                </li>))}</ul>
            )}
          </Card>
        )}
        <Card title="Upcoming classes" subtitle="Next scheduled sessions">
          {loading ? <Skeleton rows={3} /> : !d || d.upcoming_classes.length === 0 ? (
            <Empty icon={CalendarDays} title="No classes scheduled" text="Scheduled class sessions will be listed here." />
          ) : (
            <ul className="divide-y divide-slate-100">{d.upcoming_classes.map((c) => (
              <li key={c.id} className="py-2.5">
                <div className="text-xs font-semibold text-slate-900 truncate">{c.title}</div>
                <div className="text-[11px] text-slate-500">{c.batch_name}{c.trainer_name ? ` · ${c.trainer_name}` : ''} · {fmtDate(c.starts_at)}, {fmtTime(c.starts_at)}</div>
              </li>))}</ul>
          )}
        </Card>
        {isAdmin && (
          <Card title="Recent payments" subtitle="Latest fee transactions">
            {loading ? <Skeleton rows={3} /> : !d?.recent_payments || d.recent_payments.length === 0 ? (
              <Empty icon={IndianRupee} title="No payments recorded" text="Fee payments and reversals will appear here." />
            ) : (
              <ul className="divide-y divide-slate-100">{d.recent_payments.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="text-xs font-semibold text-slate-900 truncate">{p.student_name}</div><div className="text-[11px] text-slate-400">{p.invoice_number} · {p.method.replace('_', ' ')} · {fmtDate(p.payment_date)}</div></div>
                  <span className={`text-xs font-bold tabular-nums ${p.entry_type === 'reversal' ? 'text-rose-600' : 'text-emerald-700'}`}>{p.entry_type === 'reversal' ? '−' : '+'}{money(p.amount)}</span>
                </li>))}</ul>
            )}
          </Card>
        )}
      </div>

      {isAdmin && (
        <Card title="Employee performance" subtitle="Leads owned, converted and overdue, by assignee">
          {loading ? <Skeleton rows={3} /> : !d?.employee_performance || d.employee_performance.length === 0 ? (
            <Empty icon={UserCheck} title="No assigned leads yet" text="Assign leads to staff to see their performance here." />
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-xs min-w-[520px]">
                <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 pb-2 font-semibold">Employee</th><th className="pb-2 font-semibold text-right">Leads</th><th className="pb-2 font-semibold text-right">Open</th><th className="pb-2 font-semibold text-right">Converted</th><th className="pb-2 font-semibold text-right">Rate</th><th className="pr-5 pb-2 font-semibold text-right">Overdue follow-ups</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.employee_performance.map((e) => (
                    <tr key={e.id}>
                      <td className="px-5 py-2.5 font-semibold text-slate-900">{e.full_name || 'Unnamed staff'}</td>
                      <td className="py-2.5 text-right tabular-nums">{e.total}</td><td className="py-2.5 text-right tabular-nums">{e.open}</td>
                      <td className="py-2.5 text-right tabular-nums">{e.converted}</td><td className="py-2.5 text-right tabular-nums">{pct(e.converted, e.total)}%</td>
                      <td className={`pr-5 py-2.5 text-right tabular-nums ${e.overdue_followups > 0 ? 'text-rose-600 font-semibold' : ''}`}>{e.overdue_followups}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
