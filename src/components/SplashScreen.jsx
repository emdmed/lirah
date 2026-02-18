import { useEffect, useState } from 'react';
import { Check, FolderOpen, Terminal } from 'lucide-react';
import { RetroSpinner } from './ui/RetroSpinner';

const steps = [
  { id: 'navigate', label: 'Navigating to project', icon: FolderOpen },
  { id: 'claude', label: 'Starting Claude', icon: Terminal },
];

function StepIndicator({ step, status, index }) {
  const Icon = step.icon;
  return (
    <div className={`flex items-center gap-3 transition-all duration-300 ${
      status === 'pending' ? 'opacity-25' : 'opacity-100'
    }`}>
      <div className={`w-6 h-6 flex items-center justify-center border border-sketch ${
        status === 'active' ? 'outline outline-1 outline-dashed outline-ring/70 outline-offset-0' : ''
      }`}
        style={{ backgroundColor: status === 'done' ? 'var(--color-input-background)' : 'transparent' }}
      >
        {status === 'active' ? (
          <RetroSpinner size={14} lineWidth={2} />
        ) : status === 'done' ? (
          <Check className="w-3 h-3 opacity-70" />
        ) : (
          <span className="text-[10px] font-mono opacity-40">{index + 1}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Icon className="w-3 h-3 opacity-50" />
        <span className="text-xs font-mono">{step.label}</span>
      </div>
    </div>
  );
}

export function SplashScreen({ visible, projectName, currentStep, onComplete }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (currentStep === 'done') {
      const timer = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => onComplete?.(), 400);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentStep, onComplete]);

  if (!visible) return null;

  const getStatus = (stepId) => {
    const stepIndex = steps.findIndex(s => s.id === stepId);
    const currentIndex = currentStep === 'done' ? steps.length : steps.findIndex(s => s.id === currentStep);
    if (stepIndex < currentIndex) return 'done';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-400 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: 'var(--color-background, #0a0a0a)' }}
    >
      {/* Branding */}
      <div className="mb-8" style={{ fontFamily: "'Grenze Gotisch', serif", fontSize: '42px', lineHeight: 1 }}>
        Lirah
      </div>

      <div className="flex flex-col items-center">
        {/* Project name label */}
        <div className="border border-sketch px-4 py-2 shadow-xs"
          style={{ backgroundColor: 'var(--color-input-background)' }}
        >
          <span className="text-xs font-mono font-medium">{projectName}</span>
        </div>

        {/* Connecting dashed line */}
        <div className="w-px h-4 border-l border-sketch" />

        {/* Steps container */}
        <div className="border border-sketch p-3 flex flex-col gap-3 min-w-[240px]">
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-30">Initialization</div>
          {steps.map((step, index) => (
            <StepIndicator key={step.id} step={step} status={getStatus(step.id)} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
