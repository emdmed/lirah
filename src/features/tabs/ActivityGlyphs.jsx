import { Lamp } from '../../components/instrument/Lamp';

// The star-family activity icons (see ACTIVITY in tabActivity.js). They take
// the lucide icon props ActivityIcon passes and size themselves.

// The four-point star of --ins-star, as an outline (the "done" Evenstar).
const STAR_OUTLINE = 'M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z';

export const StarLamp = () => <Lamp state="on" />;

export const LensLamp = () => <Lamp state="off" />;

// The same star, filled and unlit: an agent resting at its prompt. It is a
// star (an agent is there) but carries no glow, unlike the working star.
export function StarDim() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
      <path d={STAR_OUTLINE} fill="currentColor" />
    </svg>
  );
}

export function StarOutline() {
  return (
    <svg width="11" height="11" viewBox="-0.5 -0.5 11 11" aria-hidden="true">
      <path d={STAR_OUTLINE} fill="none" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
