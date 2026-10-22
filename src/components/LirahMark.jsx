import { cn } from '@/lib/utils';

// The Lirah mark: Ithil's crescent as the bowl of a lyre, its horns drawn up
// into tall elvish points, a dipped yoke across them and Eärendil's star above.
// One flat colour, drawn on a 100-unit grid (ink x 12..88, y 5..94).
const BODY =
  'M22 8C24 34 12 48 14 64C16 84 32 94 50 94C68 94 84 84 86 64C88 48 76 34 78 8C77 34 70 48 70 60C70 74 62 80 50 80C38 80 30 74 30 60C30 48 23 34 22 8Z';
const STAR = 'M50 5Q51.28 15.08 58 17Q51.28 18.92 50 29Q48.72 18.92 42 17Q48.72 15.08 50 5Z';
const YOKE = 'M23.5 32Q50 41 76.5 32';
const STRINGS = 'M40 35.6L40 78M50 37L50 80M60 35.6L60 78';

// At 24px and under the strings would fall below a device pixel, so they
// thicken to stay visible in chrome rows. `lit` makes the mark a lamp: it
// takes the lamp colour and glows (the title bar's live-session indicator).
// Passing `lit` at all makes the mark a session lamp, titled for its state
// unless `title` says otherwise.
const FULL = { yoke: 3, strings: 2.2 };
const SMALL = { yoke: 4.2, strings: 3.6 };

export function LirahMark({ size = 48, title, lit, className }) {
  const weight = size <= 24 ? SMALL : FULL;
  if (title === undefined && lit !== undefined) title = lit ? 'Lirah · session live' : 'Lirah · no session';
  return (
    <svg
      width={size}
      height={size}
      viewBox="2 1.5 96 96"
      className={cn('ins-mark', className)}
      data-lit={lit || undefined}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={BODY} style={{ stroke: 'none' }} />
      <path d={STAR} style={{ stroke: 'none' }} />
      <path d={YOKE} style={{ fill: 'none', strokeWidth: weight.yoke, strokeLinecap: 'round' }} />
      <path d={STRINGS} style={{ fill: 'none', strokeWidth: weight.strings, strokeLinecap: 'round' }} />
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
