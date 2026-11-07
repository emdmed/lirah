import { cn } from '@/lib/utils';

// The Lirah mark: Ithil's crescent drawn up into a bare lyre (tall horns, no
// strings) and, above it, one body in its ring, the orrery's planet on its orbit.
// One flat colour, drawn on a 100-unit grid (ink x 17..83, y 9..90).
const BODY =
  'M22 8C24 34 12 48 14 64C16 84 32 94 50 94C68 94 84 84 86 64C88 48 76 34 78 8C77 34 70 48 70 60C70 74 62 80 50 80C38 80 30 74 30 60C30 48 23 34 22 8Z';
const LYRE = 'translate(50 52) scale(.86) translate(-50 -49.5)';

// At 24px and under the ring would fall below a device pixel, so it and the
// body thicken. `lit` makes the body a lamp: it alone takes the lamp colour and
// glows (the title bar's live-session indicator). Passing `lit` at all makes
// the mark a session lamp, titled for its state unless `title` says otherwise.
const FULL = { ring: 1.6, body: 4.2 };
const SMALL = { ring: 2.6, body: 5 };

export function LirahMark({ size = 48, title, lit, className }) {
  const weight = size <= 24 ? SMALL : FULL;
  if (title === undefined && lit !== undefined) title = lit ? 'Lirah · session live' : 'Lirah · no session';
  return (
    <svg
      width={size}
      height={size}
      viewBox="6 6 88 88"
      className={cn('ins-mark', className)}
      data-lit={lit || undefined}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={BODY} transform={LYRE} style={{ stroke: 'none' }} />
      <circle cx="50" cy="27" r="9.5" style={{ fill: 'none', strokeWidth: weight.ring }} />
      <circle className="ins-mark-body" cx="50" cy="27" r={weight.body} style={{ stroke: 'none' }} />
    </svg>
  );
}

export function LirahLockup({ size = 48, wordmarkSize = 42, stacked = false, className }) {
  return (
    <div className={`flex items-center ${stacked ? 'flex-col gap-2.5' : 'gap-3'} ${className ?? ''}`}>
      <LirahMark size={size} />
      <span className="[font-family:'Grenze_Gotisch',serif] leading-none" style={{ fontSize: wordmarkSize }}>
        Lirah
      </span>
    </div>
  );
}
