// Orrery icons: the house set (canvas "Orrery icons", rev C), drawn on a 24px grid.
// <Icon name="Close" size={12} /> or the named exports: <Close size={12} />, icon={Close}.
// Strokes stay 1px at any size (see .orrery in index.css). `lit` turns the body gold:
// only for signature icons showing live work. The dotted trail shows from 16px up.
import { cn } from '@/lib/utils';

const GLYPHS = {
  Refresh: <><path d="M18.76 13.81A7 7 0 1 1 14.05 5.31" /><circle className="b" cx="16.95" cy="7.05" r="2.2" /></>,
  Repeat: <><circle cx="12" cy="12" r="7" /><circle className="b" cx="12" cy="5" r="2.2" /><path d="M13.6 17.3L11.9 19l1.7 1.7" /></>,
  Send: <><path d="M3.5 20.5C6 14 10 9.5 15.6 7.4" /><circle className="b" cx="18" cy="6.6" r="2.2" /></>,
  Download: <><path className="d" d="M12 2.5v4.5" /><circle className="b" cx="12" cy="10.5" r="2.2" /><path d="M9 14l3 3 3-3M4 21h16" /></>,
  Upload: <><path d="M9 7l3-3 3 3M4 21h16" /><circle className="b" cx="12" cy="10.5" r="2.2" /><path className="d" d="M12 14v4.5" /></>,
  Import: <><path className="d" d="M12 1.5v3" /><circle className="b" cx="12" cy="7.5" r="2.2" /><path d="M9 11l3 3 3-3M5 13v8h14v-8" /></>,
  View: <><path d="M2.5 12C6 6.5 18 6.5 21.5 12 18 17.5 6 17.5 2.5 12z" /><circle className="b" cx="12" cy="12" r="2.4" /></>,
  Reveal: <><circle cx="11.5" cy="11.5" r="6" /><circle className="b" cx="11.5" cy="11.5" r="2" /><path d="M11 2v4M11 17v4M2 11h4M17 11h4" /></>,
  Pin: <><circle cx="11.5" cy="8" r="5" /><circle className="b" cx="11.5" cy="8" r="2.2" /><path d="M11 13v8" /></>,
  Commit: <><path d="M3 11h4.5M16.5 11H21" /><circle className="b" cx="12" cy="11" r="3.6" /></>,
  Branch: <><path d="M7 3v18M7 16C7 11.5 17 12.5 17 8.8" /><circle className="b" cx="17" cy="6.4" r="2.2" /></>,
  Merge: <><path d="M7 3v18M17 15.2C17 10.5 7 12.5 7 8" /><circle className="b" cx="17" cy="17.6" r="2.2" /></>,
  Plan: <><path d="M10 5h11M10 11h11M10 17h11M3 5h3" /><circle className="b" cx="4.5" cy="11" r="2.2" /></>,
  Filter: <><path d="M3 5h18M5.5 5l5.5 6.5M18.5 5L13 11.5" /><circle className="b" cx="12" cy="16" r="2.2" /></>,
  Stats: <><path d="M3 19h18M5 19v-2M11 19v-2M17 19v-2M4.5 15l4.5-4 4 2.5 3.4-4.4" /><circle className="b" cx="18.2" cy="7.4" r="2.2" /></>,
  Agent: <><path d="M14 5c.5 5.4 1.6 6.5 7 7-5.4.5-6.5 1.6-7 7-.5-5.4-1.6-6.5-7-7 5.4-.5 6.5-1.6 7-7z" /><path d="M6 2.5c.25 2.6.9 3.25 3.5 3.5-2.6.25-3.25.9-3.5 3.5-.25-2.6-.9-3.25-3.5-3.5 2.6-.25 3.25-.9 3.5-3.5z" /></>,
  Undo: <><path d="M7 9h7.5a5 5 0 0 1 0 10H8M10.5 5.5L7 9l3.5 3.5" /></>,
  Transfer: <><path d="M7 4v15M3.5 15.5L7 19l3.5-3.5M17 20V5M13.5 8.5L17 5l3.5 3.5" /></>,
  Play: <><path d="M7 5v14l12-7z" /></>,
  Stop: <><path d="M7 7h10v10H7z" /></>,
  Check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
  Close: <><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></>,
  Add: <><path d="M11 5v14M5 11h14" /></>,
  Done: <><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.8 2.8L16 9.6" /></>,
  Failed: <><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  Warning: <><path d="M11.5 3.5L20.5 19h-18z" /><path d="M11 9v5" /><circle className="dot" cx="11" cy="16.5" r="1.2" /></>,
  Compare: <><path d="M5 5h4M7 5v12h7M12 15l2 2-2 2M15 19h4M17 19V7h-7M12 5l-2 2 2 2" /></>,
  Database: <><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>,
  Cost: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /></>,
  Sort: <><path d="M4 5h16M4 11h11M4 17h6" /></>,
  Link: <><path d="M9 7H7a4 4 0 0 0 0 8h2M15 7h2a4 4 0 0 1 0 8h-2M8 11h8" /></>,
  Table: <><path d="M3 5h18v14H3zM3 9h18M3 15h18M9 9v10" /></>,
  Search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5.5 5.5" /></>,
  FindInFile: <><path d="M5 3h9l5 5v13H5zM14 3v5h5" /><circle cx="11" cy="13" r="3" /><path d="M13.2 15.2l2.6 2.6" /></>,
  Settings: <><path d="M3 5h18M3 11h18M3 17h18M15 2.5v5M9 8.5v5M13 14.5v5" /></>,
  Time: <><circle cx="11.5" cy="12" r="8.5" /><path d="M11 12V6.5M11 12h4.5" /></>,
  Star: <><path d="M12 3C12.6 9.4 14.6 11.4 21 12 14.6 12.6 12.6 14.6 12 21 11.4 14.6 9.4 12.6 3 12 9.4 11.4 11.4 9.4 12 3z" /></>,
  Required: <><path d="M11 3v18M4.6 7.5l13.8 9M18.4 7.5l-13.8 9" /></>,
  Best: <><path d="M4 19h16M4.5 16.5L3.5 7l5 4L12 5l3.5 6 5-4-1 9.5z" /></>,
  Trophy: <><path d="M7 5h10v4.5a5 5 0 0 1-10 0zM7 7H4c0 3 1.5 4.5 3.5 4.5M17 7h3c0 3-1.5 4.5-3.5 4.5M11 14.5V19M7 19h8" /></>,
  Quick: <><path d="M13.5 3L6 13h5.5l-1 8L18 11h-5.5z" /></>,
  Unpin: <><circle cx="11.5" cy="8" r="5" /><path d="M11 13v8M4.5 4l15 15" /></>,
  Expand: <><path d="M5 10V5h5M14 5h5v5M19 14v5h-5M10 19H5v-5" /></>,
  Collapse: <><path d="M9 3v6H3M15 3v6h6M21 15h-6v6M3 15h6v6" /></>,
  CollapseAll: <><path d="M3 9h18M3 15h18M9 2.5l3 3 3-3M9 21.5l3-3 3 3" /></>,
  HideSidebar: <><path d="M3 5h18v14H3zM9 5v14M16 9l-3 3 3 3" /></>,
  ShowSidebar: <><path d="M3 5h18v14H3zM9 5v14M13 9l3 3-3 3" /></>,
  Empty: <><circle cx="12" cy="12" r="8.5" /></>,
  ChevronDown: <><path d="M6.5 9.5l5.5 5.5 5.5-5.5" /></>,
  ChevronRight: <><path d="M9.5 6.5l5.5 5.5-5.5 5.5" /></>,
  ChevronLeft: <><path d="M14.5 6.5L9 12l5.5 5.5" /></>,
  ChevronUp: <><path d="M6.5 14.5L12 9l5.5 5.5" /></>,
  ArrowUp: <><path d="M11 20V5M6 10l5-5 6 6" /></>,
  ArrowDown: <><path d="M11 4v15M6 14l5 5 6-6" /></>,
  ParentFolder: <><path d="M19 19L7 7M7 15V7h8" /></>,
  Terminal: <><path d="M4.5 7L9.5 12l-5 5M12 17h8" /></>,
  Copy: <><path d="M9 9h11v11H9zM15 9V3H3v12h6" /></>,
  Trash: <><path d="M3 7h18M9 7V3h6v4M5.5 7l1 14h11l1-14" /></>,
  Edit: <><path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" /></>,
  Clear: <><path d="M9 21h12M3.5 15.5l10-10 6 6-9 9h-3z" /></>,
  Folder: <><path d="M3 5h6l2 2h10v12H3z" /></>,
  RemoveFolder: <><path d="M3 5h6l2 2h10v12H3zM9 13h6" /></>,
  File: <><path d="M5 3h9l5 5v13H5zM14 3v5h5" /></>,
  RemoveFile: <><path d="M5 3h9l5 5v13H5zM14 3v5h5M9 15h6" /></>,
  FileBelow: <><path d="M5 3h9l5 5v13H5zM14 3v5h5M11 10v7M8.5 14.5L11 17l2.5-2.5" /></>,
  Files: <><path d="M9 7h7l3 3v11H9zM16 7v3h3M5 17V3h9" /></>,
  Archive: <><path d="M3 5h18v4H3zM5 9v10h14V9M9 13h6" /></>,
  Save: <><path d="M5 5h11l3 3v11H5zM8 5v4h7V5M7 19v-6h10v6" /></>,
  Chat: <><path d="M3 5h16v12h-8l-4 4v-4H3z" /></>,
  NewChat: <><path d="M3 5h16v12h-8l-4 4v-4H3zM11 8v6M8 11h6" /></>,
  Code: <><path d="M8.5 6.5L3 12l5.5 5.5M15.5 6.5L21 12l-5.5 5.5" /></>,
  TextSize: <><path d="M3 7V5h11v2M9 5v14M7 19h4M15 11V9h6v2M17 9v10M15.5 19h3" /></>,
  Command: <><path d="M9 9h6v6H9zM9 9H6.5A2.5 2.5 0 1 1 9 6.5zM15 9V6.5A2.5 2.5 0 1 1 17.5 9zM15 15h2.5a2.5 2.5 0 1 1-2.5 2.5zM9 15v2.5A2.5 2.5 0 1 1 6.5 15z" /></>,
  Attach: <><path d="M17 8v7a6 6 0 0 1-12 0V6a4 4 0 0 1 8 0v9a2 2 0 0 1-4 0V8" /></>,
  Tasks: <><path d="M4 4h16v16H4zM8 12l3 3 5-6.5" /></>,
  Log: <><path d="M6 3v18M6 6h3M6 12h3M6 18h3M12 6h9M12 12h9M12 18h6" /></>,
  Jobs: <><path d="M3 7h18M3 17h18" /><circle className="b" cx="15" cy="7" r="2.2" /><circle className="b" cx="8" cy="17" r="2.2" /></>,
  Price: <><path d="M14.5 8c0-1.7-1.6-3-3.5-3s-3.5 1.3-3.5 3 1.6 2.6 3.5 3.1 3.5 1.7 3.5 3.4-1.6 3-3.5 3-3.5-1.3-3.5-3M11 2.5V5M11 17.5V20" /></>,
};

export function Icon({ name, size = 24, lit = false, className, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={props['aria-label'] ? undefined : true}
      data-lit={lit || undefined}
      data-trail={size >= 16 || undefined}
      className={cn('orrery', className)}
      {...props}
    >
      {GLYPHS[name]}
    </svg>
  );
}

const make = (name) => {
  const C = (props) => <Icon name={name} {...props} />;
  C.displayName = name;
  return C;
};

export const ICON_NAMES = Object.keys(GLYPHS);
export const {
  Refresh, Repeat, Send, Download, Upload, Import, View, Reveal, Pin, Commit, Branch, Merge, Plan, Filter, Stats, Agent, Undo, Transfer, Play, Stop, Check, Close, Add, Done, Failed, Warning, Compare, Database, Cost, Sort, Link, Table, Search, FindInFile, Settings, Time, Star, Required, Best, Trophy, Quick, Unpin, Expand, Collapse, CollapseAll, HideSidebar, ShowSidebar, Empty, ChevronDown, ChevronRight, ChevronLeft, ChevronUp, ArrowUp, ArrowDown, ParentFolder, Terminal, Copy, Trash, Edit, Clear, Folder, RemoveFolder, File, RemoveFile, FileBelow, Files, Archive, Save, Chat, NewChat, Code, TextSize, Command, Attach, Tasks, Log, Jobs, Price
} = Object.fromEntries(ICON_NAMES.map((n) => [n, make(n)]));
