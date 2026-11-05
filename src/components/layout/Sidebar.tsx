import React from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CalendarCheck,
  Settings,
  LogOut,
  GraduationCap,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RoleBadge } from '../common/Badge';

export type NavTab = 'dashboard' | 'leads' | 'students' | 'courses' | 'team' | 'batches' | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenCreateLead: () => void;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onOpenCreateLead,
  onCloseMobile,
}) => {
  const { profile, role, user, signOut } = useAuth();

  const handleNav = (tab: NavTab) => {
    onSelectTab(tab);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  // Define role-specific navigation items
  const getNavItems = () => {
    const items = [
      {
        id: 'dashboard' as NavTab,
        label: 'Dashboard',
        icon: LayoutDashboard,
      },
      {
        id: 'leads' as NavTab,
        label: role === 'employee' ? 'My Leads' : 'Leads Management',
        icon: Users,
      },
    ];

    // Student records are available to authorised school operations roles.
    if (role === 'super_admin' || role === 'admin') {
      items.push({
        id: 'students' as NavTab,
        label: 'Students',
        icon: GraduationCap,
      });
    }

    // Academic catalogue and cohort operations are managed by school admins.
    if (role === 'super_admin' || role === 'admin') {
      items.push({ id: 'courses' as NavTab, label: 'Courses', icon: Layers });
      items.push({ id: 'batches' as NavTab, label: 'Batches', icon: CalendarCheck });
    }

    // Super Admin and Admin can view Staff / Team
    if (role === 'super_admin' || role === 'admin') {
      items.push({
        id: 'team' as NavTab,
        label: 'Staff & Team',
        icon: UserCheck,
      });
    }

    // Trainer specific navigation
    if (role === 'trainer') {
      items.push({
        id: 'batches' as NavTab,
        label: 'My Batches',
        icon: GraduationCap,
      });
    }

    // Settings / Profile for everyone
    items.push({
      id: 'settings' as NavTab,
      label: role === 'super_admin' ? 'System & Profile' : 'Profile & Account',
      icon: Settings,
    });

    return items;
  };

  const navItems = getNavItems();

  return (
    <div className="flex flex-col h-full bg-[#0B1120] text-slate-200 border-r border-slate-800/80 w-64 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/70">
        <div className="flex items-center gap-3">
          {/* Chinar Leaf / Tree Logo Crest in Gold & Emerald */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37] via-[#B48A1B] to-[#0D9488] p-0.5 shadow-md flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-[#0B1120] rounded-[10px] flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6 text-[#D4AF37]"
              >
                {/* Stylized Chinar Leaf SVG */}
                <path
                  d="M12 2L13.5 6.5L17 5L15.5 9.5L19.5 9.5L16.5 13L20 15L15 16L15.5 20L12 17.5L8.5 20L9 16L4 15L7.5 13L4.5 9.5L8.5 9.5L7 5L10.5 6.5L12 2Z"
                  fill="url(#chinarGoldGrad)"
                  stroke="#EAB308"
                  strokeWidth="0.75"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 17.5V22"
                  stroke="#10B981"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="chinarGoldGrad" x1="4" y1="2" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FDE047" />
                    <stop offset="0.5" stopColor="#D4AF37" />
                    <stop offset="1" stopColor="#0D9488" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          <div className="min-w-0">
            <h1 className="font-bold text-sm tracking-wide text-white leading-tight uppercase font-sans">
              GLOBAL CHINAR
            </h1>
            <p className="text-[10px] font-medium tracking-wider text-teal-400 uppercase">
              Digital Marketing School
            </p>
          </div>
        </div>

        {/* Tagline */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-amber-400/90 font-semibold tracking-wider">
          <span>LOCAL ROOTS</span>
          <span className="text-slate-600">|</span>
          <span className="text-teal-400">GLOBAL REACH</span>
        </div>
      </div>

      {/* Primary Action Button (for authorized roles: super_admin, admin, employee) */}
      {role !== 'trainer' && (
        <div className="px-4 pt-4">
          <button
            type="button"
            onClick={onOpenCreateLead}
            className="w-full py-2.5 px-3 bg-gradient-to-r from-amber-600 via-amber-500 to-teal-600 hover:from-amber-500 hover:to-teal-500 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <Sparkles className="w-3.5 h-3.5" />
            + New Student Lead
          </button>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Navigation
        </p>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left ${
                isActive
                  ? 'bg-slate-800 text-amber-400 font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-amber-400' : 'text-slate-400'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Profile & Role Info */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/60">
        <div className="flex items-center justify-between mb-2">
          <RoleBadge role={role || 'employee'} />
          <span className="text-[10px] text-emerald-400 font-medium">Active</span>
        </div>

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-teal-900/60 border border-teal-500/30 flex items-center justify-center text-teal-300 font-bold text-xs shrink-0">
            {profile?.full_name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-white truncate">
              {profile?.full_name || 'Staff Member'}
            </p>
            <p className="text-[11px] text-slate-400 truncate font-mono">
              {user?.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            title="Sign out of CRM"
            aria-label="Sign out of CRM"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
