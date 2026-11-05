import React, { useState } from 'react';
import { Sidebar, NavTab } from './Sidebar';
import { TopBar } from './TopBar';
import { ConnectionBanner } from '../common/ConnectionBanner';

interface AppLayoutProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenCreateLead: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onSelectTab,
  onOpenCreateLead,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Topmost Connection Banner */}
      <ConnectionBanner />

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar (Fixed / Sticky 64 width) */}
        <aside className="hidden lg:block shrink-0 h-screen sticky top-0">
          <Sidebar
            currentTab={currentTab}
            onSelectTab={onSelectTab}
            onOpenCreateLead={onOpenCreateLead}
          />
        </aside>

        {/* Mobile Sidebar Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <div className="relative flex-1 flex flex-col max-w-xs w-full bg-[#0B1120] z-10 shadow-2xl">
              <Sidebar
                currentTab={currentTab}
                onSelectTab={onSelectTab}
                onOpenCreateLead={onOpenCreateLead}
                onCloseMobile={() => setMobileMenuOpen(false)}
              />
            </div>
          </div>
        )}

        {/* Main Workspace Canvas */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <TopBar
            currentTab={currentTab}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onOpenCreateLead={onOpenCreateLead}
          />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
