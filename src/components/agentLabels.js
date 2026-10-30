// Text helpers shared by the subagent list (AgentSidebar) and FIG 13.

export function formatElapsed(isoString, now = Date.now()) {
  if (!isoString) return null;
  const start = new Date(isoString).getTime();
  if (Number.isNaN(start)) return null;
  const secs = Math.floor((now - start) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${mins % 60}m`;
}

export function extractTaskLabel(desc) {
  if (!desc) return null;

  let text = desc;

  // 1. Strip leading filler words
  text = text.replace(/^(Thoroughly|Carefully|Please)\s+/i, '');

  // 2. Cut at context/instruction boundaries
  const cutPatterns = [
    /\.\s*(This is RESEARCH|Context from|IMPORTANT:|Note:|DO NOT|CRITICAL:)/i,
    /\.\s*(The following|Here is|Below is|Make sure)/i,
  ];
  for (const pattern of cutPatterns) {
    const match = text.match(pattern);
    if (match) {
      text = text.slice(0, match.index + 1);
      break;
    }
  }

  // 3. Strip absolute paths
  text = text.replace(/\s+(at|in|from)\s+\/\S+/g, '');

  // 4. Strip "the X codebase" / "the X project" boilerplate
  text = text.replace(/\s+the\s+\S+\s+(codebase|project|repo(sitory)?)\b/gi, '');

  // 5. Extract purpose clause: "for X" or "to X"
  const purposeMatch = text.match(/\b(?:for|to)\s+(.+?)\.?\s*$/i);
  if (purposeMatch && purposeMatch[1].length > 10) {
    text = purposeMatch[1];
  }

  // 6. Capitalize first letter, strip trailing period
  text = text.replace(/\.\s*$/, '').trim();
  if (text) text = text[0].toUpperCase() + text.slice(1);

  return text || null;
}

export function truncate(text, maxLen = 60) {
  if (!text || text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '…';
}

// The name a subagent is shown under: its task, else its slug or id.
export function agentName(agent) {
  return extractTaskLabel(agent.description) || agent.slug || agent.agent_id.slice(0, 8);
}
