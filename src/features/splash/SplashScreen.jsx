import { useEffect, useRef, useState } from 'react';
import { Check, FolderOpen, Terminal } from 'lucide-react';
import { RetroSpinner } from '../../components/ui/RetroSpinner.jsx';

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
      <div className={`w-5 h-5 flex items-center justify-center border border-foreground/15 ${
        status === 'active' ? 'bg-foreground/5' : ''
      }`}
        style={{ backgroundColor: status === 'done' ? 'var(--color-input-background)' : undefined }}
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
  const [fadeIn, setFadeIn] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Fade-in on mount
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => setFadeIn(true));
    } else {
      setFadeIn(false);
    }
  }, [visible]);

  useEffect(() => {
    if (currentStep === 'done') {
      const timer = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => onCompleteRef.current?.(), 400);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [currentStep]);

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
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-all duration-400 ${
        fadeOut ? 'opacity-0' : fadeIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
      }`}
      style={{ backgroundColor: 'var(--color-background, #0a0a0a)' }}
    >
      {/* Branding */}
      <div className="mb-8 opacity-80" style={{ fontFamily: "'Grenze Gotisch', serif", fontSize: '42px', lineHeight: 1 }}>
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
        <div className="w-px h-5 border-l border-dashed border-foreground/15" />

        {/* Steps container */}
        <div className="border border-sketch p-3 flex flex-col gap-3 min-w-[240px]">
          <div className="text-[10px] font-mono uppercase tracking-wider opacity-40">Initialization</div>
          {steps.map((step, index) => (
            <StepIndicator key={step.id} step={step} status={getStatus(step.id)} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
