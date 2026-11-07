import React from 'react';
import { Menu, Plus, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RoleBadge } from '../common/Badge';
import type { NavTab } from './Sidebar';

interface TopBarProps {
  currentTab: NavTab;
  onOpenMobileMenu: () => void;
  onOpenCreateLead: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  onOpenMobileMenu,
  onOpenCreateLead,
}) => {
  const { profile, role, user, signOut } = useAuth();

  const getPageTitle = (tab: NavTab) => {
    switch (tab) {
      case 'dashboard':
        return 'Executive Overview';
      case 'leads':
        return 'Leads & Admissions Pipeline';
      case 'students':
        return 'Students';
      case 'courses':
        return 'Courses & Programs';
      case 'sheets':
        return 'Google Sheets Integration';
      case 'team':
        return 'Staff & Faculty Directory';
      case 'batches':
        return 'Assigned Training Batches';
      case 'settings':
        return 'System & Profile Configuration';
      default:
        return 'CRM';
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 lg:gap-8 sticky top-0 z-30">
      {/* Zone 1: Mobile toggle & Breadcrumb Trail */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
          aria-label="Open mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs truncate">
          <span className="font-semibold text-slate-800 whitespace-nowrap">Global Chinar</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-900 font-medium truncate">{getPageTitle(currentTab)}</span>
        </div>
      </div>

      {/* Zone 2: Role & School Identifier (Single-line, unboxed) */}
      <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 whitespace-nowrap shrink-0">
        <span className="font-medium text-slate-700">Digital Marketing CRM</span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span>{profile?.full_name || user?.email}</span>
        <RoleBadge role={role || 'employee'} />
      </div>

      {/* Zone 3: Primary Actions (single-line controls, no wrapping) */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {role !== 'trainer' && (
          <button
            type="button"
            onClick={onOpenCreateLead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Add Lead</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => signOut()}
          title="Sign out"
          aria-label="Sign out"
          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
