import { Fragment, useEffect, useRef, useState } from 'react';
import { Lamp } from '../../components/instrument/Lamp.jsx';
import { LirahLockup } from '../../components/LirahMark.jsx';

const steps = [
  { id: 'navigate', label: 'Navigating to project' },
  { id: 'claude', label: 'Starting Claude' },
];

// One step on the line: its lamp (ok when done, blinking while running, off
// while pending) and its label.
function StepIndicator({ step, status }) {
  const lamp = status === 'done' ? 'ok' : status === 'active' ? 'on' : 'off';
  return (
    <span
      className={`flex items-center gap-2 text-xs font-mono transition-colors duration-300 ${
        status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
      }`}
    >
      <Lamp state={lamp} blink={status === 'active'} />
      {step.label}
    </span>
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
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* Branding */}
      <LirahLockup stacked size={60} className="mb-8 opacity-80" />

      <div className="flex flex-col items-center gap-3">
        {/* Project name, printed as a legend over a hairline. */}
        <div className="flex flex-col items-center gap-2">
          <span className="ins-legend text-foreground">{projectName}</span>
          <span className="h-px w-56 bg-[var(--ins-edge)]" aria-hidden="true" />
        </div>

        {/* Steps as one line, separated by faint stars. */}
        <div className="flex items-center gap-3" role="status" aria-label="Initialization">
          {steps.map((step, index) => (
            <Fragment key={step.id}>
              {index > 0 && <span className="ins-sep-star" aria-hidden="true" />}
              <StepIndicator step={step} status={getStatus(step.id)} />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
