import React, { useEffect, useState } from 'react';
import { BatchFeesView } from './BatchFeesView';
import { StudentFeesPanel } from './StudentFeesPanel';

// The existing Fee section, now with a per-student view next to the existing per-batch view.
export const FeesView: React.FC<{ openStudentId?: string | null; onOpenedStudent?: () => void }> = ({ openStudentId, onOpenedStudent }) => {
  const [tab, setTab] = useState<'batch' | 'student'>(openStudentId ? 'student' : 'batch');
  useEffect(() => { if (openStudentId) setTab('student'); }, [openStudentId]);
  const btn = (id: 'batch' | 'student', label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-semibold rounded-lg cursor-pointer transition ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>
  );
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Fee views" className="inline-flex gap-1 p-1 bg-white border border-slate-200 rounded-xl print:hidden">
        {btn('batch', 'By batch')}{btn('student', 'By student')}
      </div>
      {tab === 'batch' ? <BatchFeesView /> : (
        <div className="space-y-6">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-700">Finance</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Student Fees</h1>
            <p className="mt-1 text-sm text-slate-500">Every student has a fee record. Set the fee, schedule installments and record payments per student.</p></div>
          <StudentFeesPanel openStudentId={openStudentId} onOpened={onOpenedStudent} />
        </div>
      )}
    </div>
  );
};
