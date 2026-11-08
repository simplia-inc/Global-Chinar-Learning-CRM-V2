import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { SetNewPasswordView } from './components/auth/SetNewPasswordView';
import { AppLayout } from './components/layout/AppLayout';
import { NavTab } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { LeadsView } from './components/leads/LeadsView';
import { StudentsView } from './components/students/StudentsView';
import { CoursesView } from './components/courses/CoursesView';
import { TeamView } from './components/team/TeamView';
import { BatchesView } from './components/batches/BatchesView';
import { SettingsView } from './components/settings/SettingsView';
import { BrandLogo } from './components/common/BrandLogo';
import { BatchFeesView } from './components/fees/BatchFeesView';
import { SheetsIntegrationView } from './components/sheets/SheetsIntegrationView';
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
        <BrandLogo size={96} className="mb-4 animate-pulse" />

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

  const isAdminRole = role === 'super_admin' || role === 'admin';
  const dashboard = (key: string) => (
    <DashboardView key={`${key}-${refreshKey}`} onViewLeadById={handleViewLeadById} onNavigate={setCurrentTab} />
  );

  // Render view based on tab and role (unauthorised tabs fall back to the dashboard)
  const renderView = () => {
    switch (currentTab) {
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
      case 'students':
        return isAdminRole ? <StudentsView key={`students-${refreshKey}`} /> : dashboard('students-denied');
      case 'courses':
        return isAdminRole ? <CoursesView key={`courses-${refreshKey}`} /> : dashboard('courses-denied');
      case 'team':
        return isAdminRole ? <TeamView key={`team-${refreshKey}`} /> : dashboard('team-denied');
      case 'batches':
        return isAdminRole || role === 'trainer' ? <BatchesView /> : dashboard('batches-denied');
      case 'fees':
        return isAdminRole ? <BatchFeesView key={`fees-${refreshKey}`} /> : dashboard('fees-denied');
      case 'sheets':
        return isAdminRole ? <SheetsIntegrationView onViewLeadById={handleViewLeadById} /> : dashboard('sheets-denied');
      case 'settings':
        return <SettingsView />;
      default:
        return dashboard('dash');
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
