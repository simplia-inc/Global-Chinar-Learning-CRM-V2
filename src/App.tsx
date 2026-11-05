import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { SetNewPasswordView } from './components/auth/SetNewPasswordView';
import { AppLayout } from './components/layout/AppLayout';
import { NavTab } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { LeadsView } from './components/leads/LeadsView';
import { TeamView } from './components/team/TeamView';
import { BatchesView } from './components/batches/BatchesView';
import { SettingsView } from './components/settings/SettingsView';
import { LeadFormModal } from './components/leads/LeadFormModal';
import { LeadDetailsModal } from './components/leads/LeadDetailsModal';
import type { Lead } from './types/database';

const MainApp: React.FC = () => {
  const { user, profile, role, isLoading, isPasswordRecoveryMode, setIsPasswordRecoveryMode } = useAuth();

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  // Lead Modals
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // 1. Password Recovery Flow takes precedence when recovery token is detected
  if (isPasswordRecoveryMode) {
    return <SetNewPasswordView onComplete={() => setIsPasswordRecoveryMode(false)} />;
  }

  // 2. Loading Screen prevents dashboard flashing before session check finishes
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center p-4 text-white font-sans select-none">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#D4AF37] via-[#B48A1B] to-[#0D9488] p-0.5 shadow-xl mb-4 animate-pulse">
          <div className="w-full h-full bg-[#070B14] rounded-[14px] flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-[#D4AF37]"
            >
              <path
                d="M12 2L13.5 6.5L17 5L15.5 9.5L19.5 9.5L16.5 13L20 15L15 16L15.5 20L12 17.5L8.5 20L9 16L4 15L7.5 13L4.5 9.5L8.5 9.5L7 5L10.5 6.5L12 2Z"
                fill="#D4AF37"
              />
              <path
                d="M12 17.5V22"
                stroke="#10B981"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-sm font-bold tracking-wider uppercase text-white mb-1">
          GLOBAL CHINAR DIGITAL MARKETING SCHOOL
        </h1>
        <p className="text-[11px] font-semibold text-amber-400 tracking-widest uppercase mb-6">
          LOCAL ROOTS | GLOBAL REACH
        </p>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <div className="w-3.5 h-3.5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <span>Verifying database session & role...</span>
        </div>
      </div>
    );
  }

  // 3. Unauthenticated or inactive profile -> Render Login Page
  if (!user || !profile) {
    return <LoginPage />;
  }

  // Handle opening lead details
  const handleViewLead = (lead: Lead) => {
    setSelectedLeadId(lead.id);
  };

  const handleViewLeadById = (leadId: string) => {
    setSelectedLeadId(leadId);
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setIsCreateLeadOpen(true);
  };

  const handleLeadSaved = (savedLead: Lead) => {
    setRefreshKey((k) => k + 1);
  };

  // Render view based on tab and role
  const renderView = () => {
    switch (currentTab) {
      case 'dashboard':
        return (
          <DashboardView
            key={`dash-${refreshKey}`}
            onViewLead={handleViewLead}
            onViewLeadById={handleViewLeadById}
            onOpenCreateLead={() => {
              setEditingLead(null);
              setIsCreateLeadOpen(true);
            }}
            onNavigateToLeads={() => setCurrentTab('leads')}
          />
        );
      case 'leads':
        return (
          <LeadsView
            key={`leads-${refreshKey}`}
            onSelectLead={handleViewLead}
            onOpenCreateLead={() => {
              setEditingLead(null);
              setIsCreateLeadOpen(true);
            }}
            onEditLead={handleEditLead}
          />
        );
      case 'team':
        if (role === 'super_admin' || role === 'admin') {
          return <TeamView key={`team-${refreshKey}`} />;
        }
        return (
          <DashboardView
            key={`dash-fallback-${refreshKey}`}
            onViewLead={handleViewLead}
            onViewLeadById={handleViewLeadById}
            onOpenCreateLead={() => {
              setEditingLead(null);
              setIsCreateLeadOpen(true);
            }}
            onNavigateToLeads={() => setCurrentTab('leads')}
          />
        );
      case 'batches':
        return <BatchesView />;
      case 'settings':
        return <SettingsView />;
      default:
        return (
          <DashboardView
            key={`dash-def-${refreshKey}`}
            onViewLead={handleViewLead}
            onViewLeadById={handleViewLeadById}
            onOpenCreateLead={() => {
              setEditingLead(null);
              setIsCreateLeadOpen(true);
            }}
            onNavigateToLeads={() => setCurrentTab('leads')}
          />
        );
    }
  };

  return (
    <AppLayout
      currentTab={currentTab}
      onSelectTab={setCurrentTab}
      onOpenCreateLead={() => {
        setEditingLead(null);
        setIsCreateLeadOpen(true);
      }}
    >
      {renderView()}

      {/* Create / Edit Lead Modal */}
      <LeadFormModal
        isOpen={isCreateLeadOpen}
        onClose={() => {
          setIsCreateLeadOpen(false);
          setEditingLead(null);
        }}
        onSuccess={handleLeadSaved}
        initialLead={editingLead}
      />

      {/* Lead Details Drawer / Modal */}
      <LeadDetailsModal
        isOpen={Boolean(selectedLeadId)}
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onEditLead={handleEditLead}
        onLeadUpdated={() => setRefreshKey((k) => k + 1)}
      />
    </AppLayout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
