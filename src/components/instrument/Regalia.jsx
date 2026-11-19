import { useId } from 'react';

// Royal nuggets that need markup (settings.royal). Always rendered, shown by
// index.css only while their nugget is on, so the plain look is untouched.

// A red wax seal stamped with the lyre: the "needs you" mark.
export function WaxSeal({ size = 14, className = '' }) {
  const id = useId();
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 100 100" className={`royal-seal shrink-0 ${className}`}>
      <defs>
        <radialGradient id={id} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#d4503d" /><stop offset=".6" stopColor="#9c2419" /><stop offset="1" stopColor="#5e0f0a" />
        </radialGradient>
      </defs>
      <path fill={`url(#${id})`} d="M94 50 92 56 95 62 90 66 91 73 85 76 84 83 77 84 74 90 68 89 63 94 57 91 50 95 44 91 37 94 33 89 26 90 23 84 16 83 15 76 9 73 10 66 5 62 8 56 5 50 8 44 5 38 10 34 9 27 15 24 16 17 23 16 26 10 33 11 37 6 44 9 50 5 57 9 63 6 68 11 74 10 77 16 84 17 85 24 91 27 90 34 95 38 92 44Z" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="#3d0805" strokeOpacity=".55" strokeWidth="3" />
      <g transform="translate(36 32) scale(2)" fill="none" stroke="#4a0a06" strokeOpacity=".85" strokeWidth="1.6">
        <path d="M3 2c-2 4-2 8 4 11 6-3 6-7 4-11" /><path d="M5 4v7M7 3.5v8.5M9 4v7" /><circle cx="7" cy="14.5" r="1.1" />
      </g>
    </svg>
  );
}

// Heraldic tinctures in the engravers' hatching: dots for gold, level lines
// for blue, upright for red, diagonals for green and purple, a grid for black.
const TINCTURES = [
  ['Or', <circle key="o" cx="3" cy="3" r=".9" fill="currentColor" />],
  ['Azure', <path key="a" d="M0 2.5h6" stroke="currentColor" />],
  ['Gules', <path key="g" d="M2.5 0v6" stroke="currentColor" />],
  ['Vert', <path key="v" d="M0 0l6 6M-3 3l3 3M3-3l3 3" stroke="currentColor" />],
  ['Purpure', <path key="p" d="M6 0 0 6M9 3 6 6M3-3 0 0" stroke="currentColor" />],
  ['Sable', <path key="s" d="M0 2.5h6M2.5 0v6" stroke="currentColor" />],
];

// A workspace's shield, its tincture picked by its place in the list.
export function TinctureShield({ index = 0, size = 12, className = '' }) {
  const id = useId();
  const [name, hatch] = TINCTURES[index % TINCTURES.length];
  return (
    <svg aria-hidden="true" width={size * 11 / 13} height={size} viewBox="0 0 22 26" className={`royal-tincture shrink-0 ${className}`}>
      <title>{name}</title>
      <defs><pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">{hatch}</pattern></defs>
      <path d="M1 1h20v11c0 7-5 11-10 13C6 23 1 19 1 12z" fill={`url(#${id})`} stroke="var(--ins-lamp)" strokeWidth="1.6" />
    </svg>
  );
}
