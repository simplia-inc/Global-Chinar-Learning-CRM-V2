import React from 'react';
import { Users, UserPlus, PhoneCall, Clock, Award, CheckCircle2 } from 'lucide-react';
import type { DashboardStats } from '../../types/database';

interface StatCardsProps {
  stats: DashboardStats;
  loading: boolean;
}

export const StatCards: React.FC<StatCardsProps> = ({ stats, loading }) => {
  const cards = [
    {
      title: 'Total Leads',
      value: stats.totalLeads,
      icon: Users,
      trend: 'All candidate records',
      color: 'text-slate-900',
      iconBg: 'bg-slate-100 text-slate-700',
    },
    {
      title: 'New Leads',
      value: stats.newLeads,
      icon: UserPlus,
      trend: 'Fresh student inquiries',
      color: 'text-sky-700',
      iconBg: 'bg-sky-50 text-sky-700',
    },
    {
      title: 'Contacted Leads',
      value: stats.contactedLeads,
      icon: PhoneCall,
      trend: 'Counselor outreach in progress',
      color: 'text-indigo-700',
      iconBg: 'bg-indigo-50 text-indigo-700',
    },
    {
      title: 'Follow-up Required',
      value: stats.pendingFollowUps,
      icon: Clock,
      trend: 'Pending touchpoints',
      color: 'text-amber-700',
      iconBg: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'Qualified Leads',
      value: stats.qualifiedLeads,
      icon: Award,
      trend: 'Ready for batch enrollment',
      color: 'text-teal-700',
      iconBg: 'bg-teal-50 text-teal-700',
    },
    {
      title: 'Converted Leads',
      value: stats.convertedLeads,
      icon: CheckCircle2,
      trend: 'Enrolled students',
      color: 'text-emerald-700',
      iconBg: 'bg-emerald-50 text-emerald-700',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
                {card.title}
              </span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="flex items-baseline justify-between mt-0.5">
              <span className={`text-2xl font-bold tabular-nums tracking-tight ${card.color}`}>
                {loading ? '—' : card.value.toLocaleString()}
              </span>
            </div>

            <p className="text-[10px] text-slate-400 mt-1.5 truncate">
              {card.trend}
            </p>
          </div>
        );
      })}
    </div>
  );
};
