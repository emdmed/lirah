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
  lirah startup                  show what opens at launch
  lirah startup mode restore|projects
                                 reopen the last tabs, or open the startup projects
  lirah startup add <path> [--launch] [--name N]
                                 add (or update) a startup project; --launch
                                 starts its agent, --name names its tab
  lirah startup remove <path>    remove a startup project
  lirah startup clear            remove all startup projects
  lirah tasks [list] [--global] list this tab's project tasks (--global: global)
  lirah tasks add <title> [--notes N] [--global]
                                 add a task to this tab's project list
                                 (--global: the global list)
  lirah tasks done|reopen <id>   mark a task done, or not done again
  lirah tasks edit <id> [--title T] [--notes N]
                                 change a task's title or notes
  lirah tasks remove <id>        delete a task (the user can undo)
  lirah tasks move <id>          move between this project's list and the
                                 global list
                                 Task commands take --global to work on the
                                 global list instead of this tab's project.
  lirah plans [list]             list this tab's repo plans and their progress
  lirah plans show <plan>        a plan's chunks and their state
  lirah plans import <file>      import a *_plan.md file as a plan (split into chunks)
  lirah plans done <plan> <chunk> [--result T]
                                 mark the chunk in progress done; --result says
                                 what was done when there's nothing to commit
  lirah plans debug <plan> [--fix]
                                 find what's stuck or broken in a plan; --fix
                                 applies the safe repairs and checks again
  lirah jobs [list] [--all]      this tab's repo's background jobs (--all: every repo)
  lirah jobs run <prompt> [--cli C] [--label L]
                                 start a background job in this tab's repo, in
                                 an isolated worktree (asks the user first;
                                 --cli: claude, codex, gemini, ...)
  lirah jobs show <job> [--all]  one job's details
  lirah jobs cancel <job> [--all]
                                 stop a running job
  lirah jobs apply <job> [--force] [--all]
                                 apply a finished job's changes to its repo
                                 (asks the user first)
  lirah ping                     check that Lirah is reachable

  <plan> is an index from \`lirah plans\`, an id or a title; <chunk> its number or id.
  <job> is an index from \`lirah jobs\` or a job id.
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

function printTasks(data) {
  const where = data.scope === "global" ? "global list" : data.scope;
  if (!data.tasks.length) return `no tasks in ${where}`;
  const rows = data.tasks.map((t) => [t.id, t.status, t.title]);
  return `${where}\n\n${table(["ID", "STATUS", "TITLE"], rows)}`;
}

function printPlans(data) {
  if (!data.plans.length) return `no plans in ${data.repo}`;
  const rows = data.plans.map((p) => [
    String(p.index), p.id, `${p.done}/${p.total}`, p.split === "done" ? "" : `split ${p.split}`,
    p.autopilot === "off" ? "" : p.autopilot, p.title,
  ]);
  return `${data.repo}\n\n${table(["#", "ID", "DONE", "SPLIT", "AUTOPILOT", "TITLE"], rows)}`;
}

function printPlan(p) {
  const head = `${p.title} (${p.id}): ${p.done}/${p.total} done${p.split === "done" ? "" : `, split ${p.split}`}${p.autopilot === "off" ? "" : `, autopilot ${p.autopilot}`}`;
  const lines = [head];
  if (p.summary) lines.push("", p.summary);
  if (p.chunks.length) lines.push("", table(["#", "ID", "STATE", "TITLE"], p.chunks.map((c) => [String(c.n), c.id, c.state, c.title])));
  return lines.join("\n");
}

function printDebug(d) {
  const item = (f) => `- [${f.code}] ${f.problem}${f.fix ? ` (fix: ${f.fix})` : ""}${f.hint ? `\n  ${f.hint}` : ""}`;
  const lines = [`${d.title} (${d.id})`];
  if (d.applied.length) lines.push("", "applied:", ...d.applied.map((a) => `- ${a}`));
  const left = d.remaining;
  lines.push("", left.length ? (d.applied.length ? "still wrong:" : "found:") : "no problems found", ...left.map(item));
  if (!d.applied.length && left.some((f) => f.fix)) lines.push("", "run again with --fix to apply the fixes");
  lines.push("", "--json prints the plan's stored state too");
  return lines.join("\n");
}

// How long ago a job ended (or started, while it runs): 42s, 5m, 3h, 2d.
function age(j) {
  const t = j.endedAt || j.startedAt;
  if (!t) return "-";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const basename = (p) => (p || "").split("/").filter(Boolean).pop() || "";
const jobReport = (j) => j.report || (j.log ? `${j.log} (log)` : "-");

function printJobs(data) {
  const where = data.repo || "all repos";
  if (!data.jobs.length) return `no jobs in ${where}`;
  const all = !data.repo;
  const header = ["#", "ID", "STATUS", "CLI", "AGE", "FILES", ...(all ? ["REPO"] : []), "TASK", "REPORT"];
  const rows = data.jobs.map((j) => [
    String(j.index), j.id, j.status + (j.race ? " (race)" : ""), j.cli || "", age(j), String(j.files),
    ...(all ? [basename(j.repo)] : []), j.label || "", jobReport(j),
  ]);
  return `${where}\n\n${table(header, rows)}`;
}

function printJob(j) {
  const lines = [`${j.label || "(no label)"} (${j.id}): ${j.status}, ${j.cli}, ${age(j)}${j.race ? ", race candidate" : ""}`, ""];
  const stat = j.diffStat ? ` (+${j.diffStat.added ?? 0} -${j.diffStat.removed ?? 0})` : "";
  const tc = j.typecheck;
  const typecheck = !tc ? null : tc.status === "checking" ? "checking" : `${tc.errorCount ?? 0} error(s)`;
  const overlaps = j.overlaps?.length
    ? j.overlaps.map((o) => `${o.index ?? o.id} "${o.label}" (${o.files.length} file${o.files.length === 1 ? "" : "s"})`).join(", ")
    : null;
  const fields = [
    ["repo", j.repo], ["worktree", j.worktree || "none (ran in place, or already applied)"],
    ["files", `${j.files}${stat}`], ["typecheck", typecheck], ["exit code", j.exitCode], ["error", j.error],
    ["report", j.report], ["log", j.log], ["overlaps", overlaps],
  ];
  for (const [k, v] of fields) if (v !== null && v !== undefined && v !== "") lines.push(`${k}: ${v}`);
  if (j.changedFiles?.length) lines.push("", ...j.changedFiles.map((f) => `  ${f}`));
  lines.push("", "prompt:", j.prompt || "");
  return lines.join("\n");
}

function printStartup(data) {
  const lines = [`mode: ${data.mode}${data.mode === "restore" ? " (reopen the last tabs)" : " (open the startup projects)"}`];
  if (!data.projects?.length) {
    lines.push("no startup projects");
    return lines.join("\n");
  }
  const rows = data.projects.map((p, i) => [String(i + 1), p.name || "", p.launch ? "yes" : "", p.path]);
  return `${lines[0]}\n\n${table(["#", "NAME", "LAUNCH", "PATH"], rows)}`;
}

// An absolute path resolved against this shell's cwd, "~" expanded.
function absolutePath(raw, usage) {
  if (raw === undefined || raw === "" || raw === true) fail(`missing path: ${usage}`);
  let text = String(raw);
  if (text === "~" || text.startsWith("~/")) text = homedir() + text.slice(1);
  return resolvePath(text);
}

// A bare --flag right before a positional swallows it as its value: put the
// positional back and make the flag true.
function unswallow(args, key, rest) {
  if (args[key] !== undefined && typeof args[key] !== "boolean") {
    rest.unshift(String(args[key]));
    args[key] = true;
  }
}

// The absolute directory for `tabs open` / `startup add`, which must exist.
function tabPath(raw, usage = "lirah tabs open <path> [--launch]") {
  const path = absolutePath(raw, usage);
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
        unswallow(args, "launch", rest);
        const [path, ...extra] = rest;
        return ["tabs.open", [tabPath(path ?? args.path), ...extra], show];
      }
      case "close": return ["tabs.close", rest, show];
      case "rename": return ["tabs.rename", rest, show];
      case "focus": return ["tabs.focus", rest, show];
      default: fail(`unknown tabs command "${sub}" (list, open, close, rename, focus)`);
    }
  }
  if (cmd === "startup") {
    switch (sub ?? "get") {
      case "get":
      case "list":
      case "show": return ["startup.get", rest, printStartup];
      case "mode": return ["startup.mode", rest, show];
      case "add": {
        const usage = "lirah startup add <path> [--launch] [--name N]";
        unswallow(args, "launch", rest);
        const [path, ...extra] = rest;
        return ["startup.add", [tabPath(path ?? args.path, usage), ...extra], show];
      }
      case "remove":
      case "rm": {
        const [path, ...extra] = rest;
        return ["startup.remove", [absolutePath(path ?? args.path, "lirah startup remove <path>"), ...extra], show];
      }
      case "clear": return ["startup.clear", rest, show];
      default: fail(`unknown startup command "${sub}" (mode, add, remove, clear)`);
    }
  }
  if (cmd === "plans" || cmd === "plan") {
    switch (sub ?? "list") {
      case "list": return ["plans.list", rest, printPlans];
      case "show": return ["plans.show", rest, printPlan];
      case "import": {
        const [path, ...extra] = rest;
        return ["plans.import", [absolutePath(path ?? args.path, "lirah plans import <file>"), ...extra], show];
      }
      case "done": return ["plans.done", rest, show];
      case "debug": {
        unswallow(args, "fix", rest);
        return ["plans.debug", rest, printDebug];
      }
      default: fail(`unknown plans command "${sub}" (list, show, import, done, debug)`);
    }
  }
  if (cmd === "jobs" || cmd === "job") {
    unswallow(args, "all", rest);
    switch (sub ?? "list") {
      case "list": return ["jobs.list", [], printJobs];
      case "run":
      case "start": return ["jobs.run", rest, show];
      case "show": return ["jobs.show", rest, printJob];
      case "cancel": return ["jobs.cancel", rest, show];
      case "apply": unswallow(args, "force", rest); return ["jobs.apply", rest, show];
      default: fail(`unknown jobs command "${sub}" (list, run, show, cancel, apply)`);
    }
  }
  if (cmd === "tasks" || cmd === "task") {
    switch (sub ?? "list") {
      case "list": {
        unswallow(args, "global", rest);
        return ["tasks.list", [], printTasks];
      }
      case "add": {
        unswallow(args, "global", rest);
        return ["tasks.add", rest, show];
      }
      case "done":
      case "reopen":
      case "edit":
      case "remove":
      case "move": {
        unswallow(args, "global", rest);
        return [`tasks.${sub}`, rest, show];
      }
      case "rm": {
        unswallow(args, "global", rest);
        return ["tasks.remove", rest, show];
      }
      default: fail(`unknown tasks command "${sub}" (list, add, done, reopen, edit, remove, move)`);
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
