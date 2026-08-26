import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDownLeft, ArrowUpRight, FileWarning, X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { CHANGE_STYLE, changeOf, kindColor, getDesignColors } from './DesignNode';
import { iconFor, typeLabel } from './designIcons';
import '../markdown/markdown.css';

/**
 * Detail panel for the selected node — the "clear explanations" half of the
 * feature. Everything shown here comes off the spec, so there is no second
 * document to keep in sync with the diagram.
 */
export function DesignPanel({ node, edges, nodes, concerns, onSelectNode, onClose, onOpenFile }) {
  const colors = getDesignColors();

  const { inbound, outbound } = useMemo(() => {
    if (!node) return { inbound: [], outbound: [] };
    return {
      inbound: edges.filter((e) => e.to === node.id),
      outbound: edges.filter((e) => e.from === node.id),
    };
  }, [node, edges]);

  const nodeConcerns = useMemo(
    () => (node ? concerns.filter((c) => c.node === node.id) : []),
    [node, concerns]
  );

  if (!node) return null;

  const accent = kindColor(node.kind, colors);
  const NodeIcon = iconFor(node);
  const proposed = node.status === 'proposed';
  const missing = node.filesMissing || [];
  const change = changeOf(node);
  const changeStyle = CHANGE_STYLE[change];
  const fileChange = node.filesChanged || {};

  const contractList = (list, direction) => (
    <ul className="space-y-1.5">
      {list.map((edge) => {
        const otherId = direction === 'in' ? edge.from : edge.to;
        const other = nodes.get(otherId);
        return (
          <li key={edge.key} className="text-xs">
            <button
              type="button"
              onClick={() => onSelectNode(otherId)}
              className="font-mono text-[11px] hover:underline text-left"
              style={{ color: kindColor(other?.kind, colors) }}
            >
              {direction === 'in' ? '← ' : '→ '}
              {other?.label || otherId}
            </button>
            {edge.contracts.length > 0 && (
              <div className="pl-4 font-mono text-[10px] text-muted-foreground break-words">
                {edge.contracts.join(' · ')}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const section = (title, children) => (
    <div className="space-y-1.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );

  return (
    <div className="w-[320px] flex-shrink-0 border-l edge-engraved flex flex-col min-h-0 bg-background">
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b edge-engraved flex-shrink-0">
        <div className="min-w-0">
          <div
            className="font-mono text-sm truncate flex items-center gap-1.5"
            style={{ color: accent }}
          >
            <NodeIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{node.label}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">
              {typeLabel(node)}
            </span>
            <span
              className="font-mono text-[10px] px-1 rounded"
              style={{
                color: proposed ? '#fbbf24' : colors.mutedText,
                border: `1px solid ${proposed ? 'color-mix(in srgb, var(--color-status-warning) 40%, transparent)' : 'color-mix(in srgb, var(--color-border) 70%, transparent)'}`,
              }}
            >
              {node.status}
            </span>
            {/* What this work did to it, and whether that came from git or from
                the extractor's reading of the conversation. */}
            <span
              className="font-mono text-[10px] px-1 rounded"
              title={
                node.changeSource === 'git'
                  ? 'Derived from this branch’s git changes'
                  : 'As described in the conversation — no file evidence'
              }
              style={{
                color: changeStyle.color || colors.mutedText,
                border: `1px solid ${changeStyle.color ? `${changeStyle.color}66` : 'rgba(255,255,255,0.15)'}`,
              }}
            >
              {changeStyle.glyph} {changeStyle.label}
              {node.changeSource === 'git' ? '' : ' ?'}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-4">
        {section('Responsibility', <p className="text-xs leading-relaxed">{node.responsibility}</p>)}

        {node.owns?.length > 0 &&
          section(
            'Owns',
            <ul className="space-y-0.5">
              {node.owns.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  · {item}
                </li>
              ))}
            </ul>
          )}

        {inbound.length > 0 &&
          section(
            <span className="flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3" /> Receives
            </span>,
            contractList(inbound, 'in')
          )}

        {outbound.length > 0 &&
          section(
            <span className="flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Sends
            </span>,
            contractList(outbound, 'out')
          )}

        {node.files?.length > 0 &&
          section(
            'Files',
            <ul className="space-y-0.5">
              {node.files.map((file) => {
                const isMissing = missing.includes(file);
                const cls = CHANGE_STYLE[fileChange[file]];
                return (
                  <li key={file} className="flex items-start gap-1">
                    {/* Per-file change marker: which of these the work touched
                        is usually the first question about a modified node. */}
                    <span
                      className="font-mono text-[10px] w-2 flex-shrink-0 leading-4"
                      style={{ color: cls?.color || 'rgba(148,163,184,0.45)' }}
                      title={cls ? `This file was ${cls.label}` : undefined}
                    >
                      {cls?.glyph || '·'}
                    </span>
                    <button
                      type="button"
                      onClick={() => !isMissing && onOpenFile?.(file)}
                      disabled={isMissing}
                      title={isMissing ? 'Not found on disk' : 'Open file'}
                      className={`font-mono text-[10px] text-left break-all flex items-start gap-1 ${
                        isMissing ? 'text-amber-500/80 cursor-default' : 'text-muted-foreground hover:underline'
                      }`}
                    >
                      {isMissing && <FileWarning className="w-3 h-3 flex-shrink-0 mt-0.5" />}
                      {file}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

        {nodeConcerns.length > 0 &&
          section(
            'Concerns',
            <ul className="space-y-1.5">
              {nodeConcerns.map((c, i) => (
                <li key={i} className="text-xs">
                  <span className="font-mono text-[10px] uppercase text-amber-500/90">{c.kind || 'note'}</span>
                  <div className="text-muted-foreground leading-relaxed">{c.text}</div>
                </li>
              ))}
            </ul>
          )}

        {node.detail &&
          section(
            'Detail',
            <div className="markdown-body text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.detail}</ReactMarkdown>
            </div>
          )}
      </div>
    </div>
  );
}
