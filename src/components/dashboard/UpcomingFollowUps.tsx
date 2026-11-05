import React from 'react';
import { Phone, Mail, MessageSquare, MapPin, CheckCircle, Clock, Calendar } from 'lucide-react';
import type { FollowUp, ContactMethod } from '../../types/database';
import { EmptyState } from '../common/EmptyState';

interface UpcomingFollowUpsProps {
  followUps: FollowUp[];
  loading: boolean;
  onComplete: (id: string) => void;
  onViewLead: (leadId: string) => void;
}

export const UpcomingFollowUps: React.FC<UpcomingFollowUpsProps> = ({
  followUps,
  loading,
  onComplete,
  onViewLead,
}) => {
  const getMethodIcon = (method: ContactMethod) => {
    switch (method) {
      case 'call':
        return <Phone className="w-3.5 h-3.5 text-blue-600" />;
      case 'whatsapp':
        return <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />;
      case 'email':
        return <Mail className="w-3.5 h-3.5 text-purple-600" />;
      case 'in_person':
        return <MapPin className="w-3.5 h-3.5 text-amber-600" />;
      default:
        return <Clock className="w-3.5 h-3.5 text-slate-500" />;
    }
  };

  const formatSchedule = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Upcoming Follow-Ups</h3>
          <p className="text-xs text-slate-500 mt-0.5">Scheduled admissions calls & visits</p>
        </div>
        <span className="text-xs font-semibold tabular-nums text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
          {followUps.length} Pending
        </span>
      </div>

      {loading ? (
        <div className="space-y-3 py-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="w-8 h-8 bg-slate-200 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-slate-200 rounded w-1/2" />
                <div className="h-2.5 bg-slate-200 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : followUps.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No pending follow-ups"
          description="All scheduled inquiries and touchpoints have been addressed."
          className="border-0 bg-transparent py-8"
        />
      ) : (
        <div className="space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
          {followUps.map((item) => (
            <div
              key={item.id}
              className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-white transition-all flex items-start justify-between gap-3 group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                  {getMethodIcon(item.contact_method)}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onViewLead(item.lead_id)}
                      className="text-xs font-semibold text-slate-900 hover:text-teal-700 truncate cursor-pointer text-left"
                    >
                      {item.lead?.full_name || 'Prospect'}
                    </button>
                    <span className="text-[10px] text-slate-400 capitalize">
                      · {item.contact_method}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {item.notes || 'Routine follow-up call'}
                  </p>

                  <p className="text-[10px] text-amber-700 font-medium tabular-nums mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatSchedule(item.scheduled_at)}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onComplete(item.id)}
                title="Mark as completed"
                className="shrink-0 p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
