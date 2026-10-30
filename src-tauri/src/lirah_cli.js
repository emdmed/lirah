// `lirah` CLI (installed by Lirah): lets the agent in a Lirah tab configure
// Lirah. Sends one request to the app's control socket ($LIRAH_CONTROL) and
// prints the reply. Run `lirah help` for the commands.
//
// Any other `lirah <cmd> [positional...] [--key value | --key=value | --flag]`
// is sent as is: positionals go in args._; flag values are parsed as JSON when
// they parse (numbers, booleans, objects), else kept as strings. A bare --flag
// is true.
import { connect } from "node:net";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";

const CLIENT_TIMEOUT_MS = 70_000; // the app gives up on its side after 60 s

const USAGE = `usage: lirah <command> [args...] [--json]

  lirah settings [list]          list settings: key, value, default, allowed, description
  lirah settings get <key>       print one setting's value
  lirah settings set <key> <v>   change a setting (booleans take on/off)
  lirah settings reset <key>     put a setting back to its default
  lirah theme [list]             list themes (* marks the current one)
  lirah theme get                print the current theme
  lirah theme set <name>         switch theme (id or display name)
  lirah tabs [list]              list tabs (* active, > this tab)
  lirah tabs open <path> [--launch]
                                 open a tab in <path>; --launch starts its agent
  lirah tabs close <tab>         close a tab (asks if its agent is busy)
  lirah tabs rename <tab> <name> rename a tab (empty name: automatic again)
  lirah tabs focus <tab>         switch to a tab
  lirah ping                     check that Lirah is reachable

  <tab> is "." (this tab), an index from \`lirah tabs\`, a tab id or a name.

  --json   print the reply as JSON
Errors go to stderr and exit 1. Some changes ask the user to confirm first.
`;

function fail(message) {
  process.stderr.write(`lirah: ${message}\n`);
  process.exit(1);
}

function parseValue(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      args._.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--") || arg.length === 2) {
      args._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq !== -1) {
      args[arg.slice(2, eq)] = parseValue(arg.slice(eq + 1));
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      args[arg.slice(2)] = parseValue(argv[++i]);
    } else {
      args[arg.slice(2)] = true;
    }
  }
  return args;
}

// One request to the app; resolves with the reply's data or exits on error.
function request(cmd, args) {
  const socketPath = process.env.LIRAH_CONTROL;
  if (!socketPath) fail("not running inside a Lirah tab (LIRAH_CONTROL is unset)");
  const payload = { session: process.env.LIRAH_PTY_SESSION || null, cmd, args };
  return new Promise((resolve) => {
    let buffer = "";
    const socket = connect(socketPath);
    socket.setEncoding("utf8");
    socket.setTimeout(CLIENT_TIMEOUT_MS, () => {
      socket.destroy();
      fail("Lirah didn't answer in time");
    });
    socket.on("connect", () => socket.write(JSON.stringify(payload) + "\n"));
    socket.on("error", (e) => fail(`can't reach Lirah at ${socketPath} (${e.code || e.message})`));
    socket.on("data", (chunk) => {
      buffer += chunk;
    });
    socket.on("end", () => {
      const line = buffer.trim();
      if (!line) fail("Lirah closed the connection without answering");
      let reply;
      try {
        reply = JSON.parse(line);
      } catch {
        fail(`bad reply from Lirah: ${line.slice(0, 200)}`);
      }
      if (!reply.ok) fail(reply.error || "command failed");
      resolve(reply.data ?? null);
    });
  });
}

const show = (v) => (v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v));

function allowed(entry) {
  if (entry.values) return entry.values.join(", ");
  if (entry.type === "bool") return "on, off";
  return entry.type === "number" ? "number" : "text";
}

function description(entry) {
  const notes = [entry.appliesTo && `applies to ${entry.appliesTo}`, entry.guarded && "asks the user"];
  const extra = notes.filter(Boolean).join("; ");
  return extra ? `${entry.label} (${extra})` : entry.label || "";
}

function table(header, rows) {
  const all = [header, ...rows];
  const widths = header.map((_, c) => Math.max(...all.map((r) => r[c].length)));
  return all
    .map((r) => r.map((cell, c) => (c === r.length - 1 ? cell : cell.padEnd(widths[c]))).join("  ").trimEnd())
    .join("\n");
}

function printSettings(list) {
  const rows = list.map((e) => [e.key, show(e.value), show(e.default), allowed(e), description(e)]);
  return table(["KEY", "VALUE", "DEFAULT", "ALLOWED", "DESCRIPTION"], rows);
}

function printThemes(list) {
  return table(["", "THEME", "NAME"], list.map((t) => [t.current ? "*" : "", t.id, t.name || ""]));
}

function printTabs(list) {
  const rows = list.map((t) => [
    `${t.active ? "*" : ""}${t.caller ? ">" : ""}`,
    String(t.index),
    t.name || "",
    t.agent || "",
    t.path || "",
  ]);
  return table(["", "#", "NAME", "AGENT", "PATH"], rows);
}

// The absolute directory for `tabs open`, resolved against this shell's cwd.
function tabPath(raw) {
  if (raw === undefined || raw === "") fail("missing path: lirah tabs open <path> [--launch]");
  let text = String(raw);
  if (text === "~" || text.startsWith("~/")) text = homedir() + text.slice(1);
  const path = resolvePath(text);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    fail(`no such directory: ${path}`);
  }
  if (!stat.isDirectory()) fail(`not a directory: ${path}`);
  return path;
}

// [dispatcher cmd, positionals, human formatter] for the known commands.
function route(cmd, positional, args) {
  const [sub, ...rest] = positional;
  if (cmd === "settings") {
    switch (sub ?? "list") {
      case "list": return ["settings.list", rest, printSettings];
      case "get": return ["settings.get", rest, show];
      case "set": return ["settings.set", rest, show];
      case "reset": return ["settings.reset", rest, show];
      default: fail(`unknown settings command "${sub}" (list, get, set, reset)`);
    }
  }
  if (cmd === "theme") {
    switch (sub ?? "list") {
      case "list": return ["theme.list", rest, printThemes];
      case "get": return ["theme.get", rest, show];
      case "set": return ["theme.set", rest, show];
      default: fail(`unknown theme command "${sub}" (list, get, set)`);
    }
  }
  if (cmd === "tabs" || cmd === "tab") {
    switch (sub ?? "list") {
      case "list": return ["tabs.list", rest, printTabs];
      case "open": {
        // A bare --launch before the path swallows it as its value.
        if (args.launch !== undefined && typeof args.launch !== "boolean") {
          rest.unshift(String(args.launch));
          args.launch = true;
        }
        const [path, ...extra] = rest;
        return ["tabs.open", [tabPath(path ?? args.path), ...extra], show];
      }
      case "close": return ["tabs.close", rest, show];
      case "rename": return ["tabs.rename", rest, show];
      case "focus": return ["tabs.focus", rest, show];
      default: fail(`unknown tabs command "${sub}" (list, open, close, rename, focus)`);
    }
  }
  return [cmd, positional, show];
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  (cmd ? process.stdout : process.stderr).write(USAGE);
  process.exit(cmd ? 0 : 1);
}

const args = parseArgs(rest);
if (args.help || args.h) {
  process.stdout.write(USAGE);
  process.exit(0);
}
const json = args.json === true;
delete args.json;

const [name, positional, format] = route(cmd, args._, args);
args._ = positional;
const data = await request(name, args);
if (json) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
} else if (data !== null) {
  const text = format(data);
  if (text !== "") process.stdout.write(text + "\n");
}
process.exit(0);
