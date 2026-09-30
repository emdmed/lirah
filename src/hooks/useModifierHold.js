import { useEffect, useState } from 'react';

const HOLD_MS = 400;

/**
 * Reports which modifier chord is being held on its own ('ctrl' or
 * 'ctrl+shift'), after a short delay so ordinary shortcuts like ^C never
 * trigger it. Any other key, a release, or losing focus clears it.
 */
export function useModifierHold() {
  const [held, setHeld] = useState(null);

  useEffect(() => {
    let timer = null;
    const clear = () => {
      clearTimeout(timer);
      timer = null;
      setHeld(null);
    };
    const onKeyDown = (e) => {
      const isModifier = e.key === 'Control' || e.key === 'Shift';
      if (!isModifier || e.altKey || e.metaKey || !e.ctrlKey) {
        clear();
        return;
      }
      const chord = e.shiftKey ? 'ctrl+shift' : 'ctrl';
      clearTimeout(timer);
      timer = setTimeout(() => setHeld(chord), HOLD_MS);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', clear, true);
    window.addEventListener('blur', clear);
    window.addEventListener('mousedown', clear, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', clear, true);
      window.removeEventListener('blur', clear);
      window.removeEventListener('mousedown', clear, true);
    };
  }, []);

  return { held };
}
