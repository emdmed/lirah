import React from 'react';
import { getFlowchartColors } from '@/themes/theme-config';
import {
  NODE_HEADER_H,
  NODE_LINE_H,
  NODE_PAD_X,
  NODE_PAD_Y,
  NODE_FOOTER_H,
  BODY_CHAR_W,
} from './designLayout';

const FALLBACK_COLORS = {
  component: '#7dd3fc',
  function: '#fbbf24',
  hook: '#a78bfa',
  constant: '#94a3b8',
  props: '#4ade80',
  edge: 'rgba(148,163,184,0.4)',
  highlight: '#7dd3fc',
  text: '#e2e8f0',
  mutedText: '#64748b',
};

export function getDesignColors() {
  try {
    return { ...FALLBACK_COLORS, ...getFlowchartColors() };
  } catch {
    return FALLBACK_COLORS;
  }
}

/**
 * Node kinds borrow the theme's existing flowchart palette rather than
 * introducing new colours, so a design diagram matches the compact flowchart in
 * every theme the app ships.
 */
const KIND_PALETTE_KEY = {
  ui: 'component',
  service: 'function',
  store: 'hook',
  db: 'constant',
  queue: 'props',
  external: 'constant',
  job: 'function',
  module: 'constant',
};

const KIND_TAG = {
  ui: 'UI',
  service: 'SVC',
  store: 'STORE',
  db: 'DB',
  queue: 'QUEUE',
  external: 'EXT',
  job: 'JOB',
  module: 'MOD',
};

export function kindColor(kind, colors = getDesignColors()) {
  return colors[KIND_PALETTE_KEY[kind] || 'constant'] || colors.constant;
}

/**
 * What this work did to a part — the diagram's second axis, and the one most
 * people open it for. Deliberately never signalled by colour alone: a changed
 * node also gets a ribbon along its top edge, a glyph before its label and the
 * word in its footer, so it survives a colourblind reader and a screenshot.
 */
export const CHANGE_STYLE = {
  added: { color: '#34d399', glyph: '+', label: 'added' },
  modified: { color: '#f59e0b', glyph: '~', label: 'modified' },
  untouched: { color: null, glyph: '', label: 'untouched' },
};

export const changeOf = (node) => (CHANGE_STYLE[node?.change] ? node.change : 'untouched');

export const DesignNode = React.memo(function DesignNode({
  node,
  rect,
  lines,
  hasFooter,
  selected,
  connected,
  dimmed,
  faded,
  onSelect,
}) {
  const colors = getDesignColors();
  const accent = kindColor(node.kind, colors);
  const proposed = node.status === 'proposed';
  const unverified = node.status === 'existing' && (node.filesMissing?.length || 0) > 0;

  const change = changeOf(node);
  const changeStyle = CHANGE_STYLE[change];
  const touched = change !== 'untouched';

  // Untouched parts are context: they keep their shape but step back so the
  // parts this work actually creates or edits are what the eye lands on.
  const stroke = selected
    ? accent
    : touched
      ? `${changeStyle.color}cc`
      : connected
        ? `${accent}77`
        : 'rgba(255,255,255,0.12)';
  const fill = selected
    ? `${accent}1F`
    : touched
      ? `${changeStyle.color}14`
      : connected
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(255,255,255,0.03)';

  const tag = KIND_TAG[node.kind] || 'MOD';
  const tagW = tag.length * 5.4 + 8;

  const footerParts = [];
  if (touched) footerParts.push(changeStyle.label);
  if (node.owns?.length) footerParts.push(`owns ${node.owns.length}`);
  if (node.files?.length) footerParts.push(`${node.files.length} file${node.files.length > 1 ? 's' : ''}`);
  if (proposed) footerParts.push('proposed');

  // Label shares the header row with the kind tag, and with the change glyph
  // when there is one.
  const glyphW = touched ? 11 : 0;
  const labelX = rect.x + NODE_PAD_X + glyphW;
  const labelBudget = Math.floor((rect.w - NODE_PAD_X * 2 - tagW - 6 - glyphW) / 6.7);
  const label =
    node.label.length > labelBudget ? `${node.label.slice(0, Math.max(1, labelBudget - 1))}…` : node.label;

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
      style={{ cursor: 'pointer', opacity: dimmed ? 0.22 : faded ? 0.3 : 1 }}
    >
      {/* The box only has room for a clipped label, so the full name (and the
          reason for any warning) lives in the hover tooltip. */}
      <title>
        {[
          node.label,
          node.responsibility,
          `This work: ${changeStyle.label}${
            node.changeSource === 'git' ? ' (from git)' : ' (as described)'
          }`,
          unverified &&
            `Unverified: ${node.filesMissing.length} file(s) not found on disk — ${node.filesMissing.join(', ')}`,
        ]
          .filter(Boolean)
          .join('\n\n')}
      </title>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={4}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected ? 1.6 : 1}
        strokeDasharray={proposed ? '5 3' : undefined}
      />
      {/* Kind stripe — a quick read of what sort of thing this is. */}
      <rect x={rect.x} y={rect.y} width={3} height={rect.h} rx={1.5} fill={accent} opacity={proposed ? 0.5 : 0.9} />

      {/* Change ribbon — added/modified read from across the room. */}
      {touched && (
        <rect
          x={rect.x + 1}
          y={rect.y}
          width={rect.w - 2}
          height={3}
          rx={1.5}
          fill={changeStyle.color}
        />
      )}
      {touched && (
        <text
          x={rect.x + NODE_PAD_X}
          y={rect.y + 16}
          fill={changeStyle.color}
          fontSize={12}
          fontFamily="monospace"
          fontWeight={700}
        >
          {changeStyle.glyph}
        </text>
      )}

      <text
        x={labelX}
        y={rect.y + 16}
        fill={selected ? accent : colors.text}
        fontSize={11}
        fontFamily="monospace"
        fontWeight={600}
      >
        {label}
      </text>
      <rect
        x={rect.x + rect.w - NODE_PAD_X - tagW}
        y={rect.y + 6}
        width={tagW}
        height={12}
        rx={2}
        fill={`${accent}26`}
      />
      <text
        x={rect.x + rect.w - NODE_PAD_X - tagW + 4}
        y={rect.y + 15}
        fill={accent}
        fontSize={7.5}
        fontFamily="monospace"
        fontWeight={600}
      >
        {tag}
      </text>

      {lines.map((line, i) => (
        <text
          key={i}
          x={rect.x + NODE_PAD_X}
          y={rect.y + NODE_HEADER_H + NODE_PAD_Y + i * NODE_LINE_H + 8}
          fill={colors.mutedText}
          fontSize={9.5}
          fontFamily="monospace"
        >
          {line}
        </text>
      ))}

      {hasFooter && footerParts.length > 0 && (
        <text
          x={rect.x + NODE_PAD_X}
          y={rect.y + rect.h - NODE_PAD_Y - 2}
          fill={touched ? changeStyle.color : colors.mutedText}
          fontSize={8.5}
          fontFamily="monospace"
          opacity={0.75}
        >
          {footerParts.join(' · ')}
        </text>
      )}

      {/* Claimed to exist, but at least one of its files was not found on disk. */}
      {unverified && (
        <circle cx={rect.x + rect.w - 7} cy={rect.y + rect.h - 7} r={3.5} fill="#fbbf24" />
      )}
    </g>
  );
});

export { BODY_CHAR_W };
