import React from 'react';
import type { LeadStatus, LeadPriority, UserRole, FollowUpStatus } from '../../types/database';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'gold' | 'emerald' | 'amber' | 'crimson' | 'slate' | 'blue';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '' }) => {
  const variantStyles = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    gold: 'bg-amber-50 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    crimson: 'bg-rose-50 text-rose-800 border-rose-200',
    slate: 'bg-slate-100 text-slate-800 border-slate-200',
    blue: 'bg-sky-50 text-sky-800 border-sky-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};

export const RoleBadge: React.FC<{ role: UserRole | string; className?: string }> = ({ role, className = '' }) => {
  switch (role) {
    case 'super_admin':
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-md bg-amber-50 text-amber-900 border border-amber-300 ${className}`}>
          Super Admin
        </span>
      );
    case 'admin':
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-md bg-teal-50 text-teal-800 border border-teal-200 ${className}`}>
          Admin
        </span>
      );
    case 'employee':
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-md bg-sky-50 text-sky-800 border border-sky-200 ${className}`}>
          Admissions & Staff
        </span>
      );
    case 'trainer':
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-md bg-purple-50 text-purple-800 border border-purple-200 ${className}`}>
          Trainer
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-200 ${className}`}>
          {role}
        </span>
      );
  }
};

export const StatusBadge: React.FC<{ status: LeadStatus | string; className?: string }> = ({ status, className = '' }) => {
  switch (status) {
    case 'new':
      return <Badge variant="blue" className={className}>New Lead</Badge>;
    case 'contacted':
      return <Badge variant="amber" className={className}>Contacted</Badge>;
    case 'in_progress':
      return <Badge variant="default" className={className}>In Progress</Badge>;
    case 'qualified':
      return <Badge variant="emerald" className={className}>Qualified</Badge>;
    case 'converted':
    case 'enrolled':
      return <Badge variant="emerald" className={className}>Converted / Enrolled</Badge>;
    case 'lost':
      return <Badge variant="crimson" className={className}>Lost</Badge>;
    case 'archived':
      return <Badge variant="slate" className={className}>Archived</Badge>;
    default:
      return <Badge variant="default" className={className}>{status}</Badge>;
  }
};

export const PriorityBadge: React.FC<{ priority: LeadPriority | string; className?: string }> = ({ priority, className = '' }) => {
  switch (priority) {
    case 'urgent':
      return (
        <span className={`inline-flex items-center gap-1 text-xs font-semibold text-rose-700 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
          Urgent
        </span>
      );
    case 'high':
      return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium text-amber-700 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          High
        </span>
      );
    case 'medium':
      return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium text-slate-600 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          Medium
        </span>
      );
    case 'low':
      return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium text-slate-500 ${className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
          Low
        </span>
      );
    default:
      return <span className={`text-xs text-slate-500 ${className}`}>{priority}</span>;
  }
};

export const FollowUpStatusBadge: React.FC<{ status: FollowUpStatus | string; className?: string }> = ({ status, className = '' }) => {
  switch (status) {
    case 'pending':
      return <Badge variant="amber" className={className}>Pending</Badge>;
    case 'completed':
      return <Badge variant="emerald" className={className}>Completed</Badge>;
    case 'cancelled':
      return <Badge variant="slate" className={className}>Cancelled</Badge>;
    case 'overdue':
      return <Badge variant="crimson" className={className}>Overdue</Badge>;
    default:
      return <Badge variant="default" className={className}>{status}</Badge>;
  }
};
