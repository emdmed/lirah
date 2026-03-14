import React from "react";
import { getFlowchartColors } from "@/themes/theme-config";
import {
  NODE_H_COLLAPSED, NODE_PAD_X, NODE_PAD_Y, NODE_LINE_H,
  measureText, getDetailGroups, computeDetailLayout,
} from "./graphLayout";

const TAG_LABELS = { component: 'COMP', function: 'FN', hook: 'HOOK', constant: 'CONST', props: 'PROPS' };

function getThemeColors() {
  try {
    return getFlowchartColors();
  } catch {
    return {
      component: '#7dd3fc', componentBg: 'rgba(125,211,252,0.15)',
      function: '#fbbf24', functionBg: 'rgba(251,191,36,0.15)',
      hook: '#a78bfa', hookBg: 'rgba(167,139,250,0.15)',
      constant: '#94a3b8', constantBg: 'rgba(148,163,184,0.12)',
      props: '#4ade80', propsBg: 'rgba(74,222,128,0.15)',
      propsStroke: 'rgba(74,222,128,0.4)',
      edge: 'rgba(148,163,184,0.4)',
      highlight: '#7dd3fc', text: '#e2e8f0', mutedText: '#64748b',
    };
  }
}

const TYPE_COLORS = {
  get component() { return getThemeColors().component; },
  get function() { return getThemeColors().function; },
  get hook() { return getThemeColors().hook; },
  get constant() { return getThemeColors().constant; },
  get props() { return getThemeColors().props; },
};

const TAG_BG = {
  get component() { return getThemeColors().componentBg; },
  get function() { return getThemeColors().functionBg; },
  get hook() { return getThemeColors().hookBg; },
  get constant() { return getThemeColors().constantBg; },
  get props() { return getThemeColors().propsBg; },
};

export { getThemeColors, TAG_LABELS };

export const GraphNode = React.memo(function GraphNode({ node, rect, expanded, highlighted, dimmed, onToggle, highlightColor }) {
  const opacity = dimmed ? 0.25 : 1;
  const colors = getThemeColors();
  const highlightFillColor = highlightColor || colors.highlight;

  const detailElements = [];
  if (expanded) {
    const groups = getDetailGroups(node);
    const { rows } = computeDetailLayout(groups);
    let lineOffset = 0;
    for (const row of rows) {
      const typeTag = TAG_LABELS[row.type] || row.type;
      const color = TYPE_COLORS[row.type] || '#94a3b8';
      const tagBg = TAG_BG[row.type] || 'rgba(148,163,184,0.1)';
      const tagW = measureText(typeTag) + 6;
      let colX = 0;
      for (let ci = 0; ci < row.columns.length; ci++) {
        const col = row.columns[ci];
        for (let li = 0; li < col.length; li++) {
          const label = col[li];
          const isCont = typeof label === 'object' && label.cont;
          const labelText = typeof label === 'object' ? label.text : label;
          const itemX = rect.x + NODE_PAD_X + colX;
          const itemY = rect.y + NODE_H_COLLAPSED + NODE_PAD_Y + (lineOffset + li) * NODE_LINE_H;
          detailElements.push(
            <g key={`${row.type}-${ci}-${li}`}>
              {!isCont && <rect x={itemX} y={itemY - 4} width={tagW} height={13} rx={2} fill={tagBg} />}
              {!isCont && <text x={itemX + 3} y={itemY + 7} fill={color} fontSize={8} fontFamily="monospace" fontWeight={600}>
                {typeTag}
              </text>}
              <text x={isCont ? itemX : itemX + tagW + 4} y={itemY + 8} fill={color} fontSize={10} fontFamily="monospace" opacity={0.85}>
                {labelText}
              </text>
            </g>
          );
        }
        colX += row.colWidths[ci] + 8;
      }
      lineOffset += row.rowLines;
    }
  }

  return (
    <g
      onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
      style={{ cursor: 'pointer', opacity }}
    >
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={4}
        fill={highlighted ? `${highlightFillColor}1E` : expanded ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}
        stroke={highlighted ? `${highlightFillColor}80` : expanded ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.12)'}
        strokeWidth={highlighted ? 1.5 : 1}
      />
      <text
        x={rect.x + NODE_PAD_X}
        y={rect.y + 18}
        fill={highlighted ? highlightFillColor : colors.text}
        fontSize={12}
        fontFamily="monospace"
        fontWeight={expanded || highlighted ? 600 : 400}
      >
        {node.fileName}
      </text>
      {detailElements}
    </g>
  );
});
