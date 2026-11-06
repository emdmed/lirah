// `lirah` CLI (installed by Lirah): lets the agent in a Lirah tab configure
// Lirah. Sends one request to the app's control socket ($LIRAH_CONTROL) and
// prints the reply. Run `lirah help` for the commands.
//
// With the app closed (its socket gone), settings (but not the sensitive ones:
// sandbox, network, hooks, agent control), theme, startup, tasks list/add/done
// and plans list/show/import/revise/rechunk/done read and write the ~/.lirah files
// directly; what needs the app (a plan's split, checking a chunk's commits)
// is left queued in the file and done when Lirah loads the repo's plans (at once
// if it is open and has them loaded: it reloads ~/.lirah files changed outside it).
//
// Any other `lirah <cmd> [positional...] [--key value | --key=value | --flag]`
// is sent as is: positionals go in args._; flag values are parsed as JSON when
// they parse (numbers, booleans, objects), else kept as strings. A bare --flag
// is true.
import { connect } from "node:net";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { lirahDir, list, read, resolveWorkspace, revisionOf, write } from "./lirah_files.js";

const CLIENT_TIMEOUT_MS = 70_000; // the app gives up on its side after 60 s

const USAGE = `usage: lirah <command> [args...] [--json]

  lirah settings [list]          list settings: key, value, default, allowed, description
  lirah settings get <key>       print one setting's value
  lirah settings set <key> <v>   change a setting (booleans take on/off)
  lirah settings reset <key>     put a setting back to its default
  lirah theme [list]             list themes (* marks the current one)
  lirah theme get                print the current theme
  lirah theme set <name>         switch theme (id or display name)
  lirah tabs [list]              list this workspace's tabs (* active, > this tab)
  lirah tabs open <path> [--launch]
                                 open a tab in <path>; --launch starts its agent
  lirah tabs close <tab>         close a tab (asks if its agent is busy)
  lirah tabs rename <tab> <name> rename a tab (empty name: automatic again)
  lirah tabs focus <tab>         switch to a tab
  lirah tabs master              whether you are the workspace's master (orchestrating) terminal
  lirah tabs note <tab> <text>   set a tab's one-line purpose (empty: clear it)
  lirah tabs show <tab>          a tab's note, branch, agent state and last reply
  lirah tabs send <tab> <prompt> send a prompt to a tab's agent without switching to it
                                 ("-" reads the prompt from stdin; boots the tab if needed)
  lirah tabs wait <tab> [--timeout 50]
                                 wait for its turn to end and print its last reply
                                 (exit 2 while still working: run it again)
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
  lirah plans revise <plan> <notes>
                                 the plan's file and a prompt to change it as
                                 asked; edit the file, then re-chunk
  lirah plans rechunk <plan>     split the plan again from its file; chunks
                                 already done stay
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

const UNREACHABLE = Symbol("unreachable");

// One request to the app; resolves with the reply's data or exits on error.
// With `fallback`, resolves UNREACHABLE instead when there's no app to ask.
function request(cmd, args, { fallback = false } = {}) {
  const socketPath = process.env.LIRAH_CONTROL;
  if (!socketPath) {
    if (fallback) return Promise.resolve(UNREACHABLE);
    fail("not running inside a Lirah tab (LIRAH_CONTROL is unset)");
  }
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
    socket.on("error", (e) => {
      if (fallback && (e.code === "ENOENT" || e.code === "ECONNREFUSED")) resolve(UNREACHABLE);
      else fail(`can't reach Lirah at ${socketPath} (${e.code || e.message})`);
    });
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
    t.note || "",
  ]);
  return table(["", "#", "NAME", "AGENT", "PATH", "NOTE"], rows);
}

function printTab(t) {
  const rows = [["name", `${t.index} ${t.name}`], ["note", t.note], ["path", t.path],
    ["role", t.role], ["branch", t.branch], ["agent", t.agent]].filter(([, v]) => v);
  const head = rows.map(([k, v]) => `${k.padEnd(7)}${v}`).join("\n");
  return t.lastReply ? `${head}\nlast reply:\n${t.lastReply}` : head;
}

// Exit 2 while the tab is still working, so a caller loops on it.
function printWait(w) {
  if (w.done) return w.reply || `(${w.state}, no reply text)`;
  process.exitCode = 2;
  return `still ${w.state === "permission" ? "waiting on a permission prompt" : w.state || "starting"}; run it again`;
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
    String(p.index), p.id, `${p.done}/${p.total}`, stageText(p), p.split === "done" ? "" : `split ${p.split}`,
    p.autopilot === "off" ? "" : p.autopilot, p.title,
  ]);
  return `${data.repo}\n\n${table(["#", "ID", "DONE", "STAGE", "SPLIT", "AUTOPILOT", "TITLE"], rows)}`;
}

// planned, building, implemented, PR #12 (open), merged
function stageText(p) {
  return p.stage === "pr-open" && p.pr ? `PR #${p.pr.number}` : p.stage;
}

function printPlan(p) {
  const head = `${p.title} (${p.id}): ${stageText(p)}, ${p.done}/${p.total} done${p.split === "done" ? "" : `, split ${p.split}`}${p.autopilot === "off" ? "" : `, autopilot ${p.autopilot}`}`;
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
      case "master": return ["tabs.master", rest, show];
      case "note": return ["tabs.note", rest, show];
      case "show": return ["tabs.show", rest, printTab];
      case "send": {
        const [tab, ...words] = rest;
        const prompt = words.length === 1 && words[0] === "-" ? readFileSync(0, "utf8") : words.join(" ");
        return ["tabs.send", [tab, prompt], show];
      }
      case "wait": return ["tabs.wait", rest, printWait];
      default: fail(`unknown tabs command "${sub}" (list, open, close, rename, focus, master, note, show, send, wait)`);
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
      case "revise": return ["plans.revise", rest, show];
      case "rechunk": return ["plans.rechunk", rest, show];
      case "debug": {
        unswallow(args, "fix", rest);
        return ["plans.debug", rest, printDebug];
      }
      default: fail(`unknown plans command "${sub}" (list, show, import, revise, rechunk, done, debug)`);
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

// --- Without the app: the data-only commands on ~/.lirah files ---
// Keep in step with their handlers in src/features/agent-control/useAgentControl.js
// and the plan and task helpers they use.

const shortId = (prefix) => `${prefix}${Math.random().toString(36).slice(2, 8)}`;

// FNV-1a as 8 hex chars, as hash8 in src/lib/ids.js (spots an edited plan file).
function hash8(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function gitOut(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

// The repo whose plans this shell sees, as resolveRepoRoot: a plan worktree's
// owner, else the git top, else the folder itself.
function repoRoot(cwd = process.cwd()) {
  const prefix = `${join(lirahDir(), "plan-worktrees")}/`;
  if (cwd.startsWith(prefix)) {
    try {
      const marker = join(prefix, cwd.slice(prefix.length).split("/")[0], ".lirah-plan.json");
      const owner = JSON.parse(readFileSync(marker, "utf8"))?.repoRoot;
      if (owner) return owner;
    } catch {
      // not a plan worktree after all
    }
  }
  return gitOut(cwd, ["rev-parse", "--show-toplevel"]) || resolvePath(cwd);
}

function workspace(hint = "") {
  const id = resolveWorkspace();
  if (!id) throw new Error(`can't tell which Lirah workspace this folder belongs to${hint}`);
  return id;
}

const GLOBAL = "global";
const taskFile = (scope) => (scope === GLOBAL ? "tasks/global.json" : `workspaces/${scope}/tasks.json`);
const taskScope = (args) => (args.global === true ? GLOBAL : workspace("; pass --global for the global list"));
const where = (scope) => (scope === GLOBAL ? "the global list" : "this workspace");

function readTasks(scope) {
  const doc = read(taskFile(scope));
  const tasks = (doc ?? (scope === GLOBAL ? read("tasks/inbox.json") : null))?.tasks;
  return { tasks: Array.isArray(tasks) ? tasks.filter((t) => t && typeof t === "object") : [], revision: revisionOf(doc) };
}

// Every plan of `repo`, from every workspace, newest first (the app's order).
function repoPlans(repo) {
  const plans = [];
  for (const ws of read("workspaces/index.json")?.workspaces ?? []) {
    let ids = [];
    try {
      ids = list(`workspaces/${ws}/plans`);
    } catch {
      continue;
    }
    for (const id of ids) {
      let doc;
      try {
        doc = read(`workspaces/${ws}/plans/${id}/plan.json`);
      } catch {
        continue; // one broken plan must not hide the others
      }
      if (doc?.repoRoot === repo && Array.isArray(doc.chunks)) plans.push({ ...doc, workspaceId: ws });
    }
  }
  return plans.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

const savePlan = (plan) => write(`workspaces/${plan.workspaceId}/plans/${plan.id}/plan.json`,
  { ...plan, updatedAt: Date.now() }, revisionOf(plan));

function findPlan(plans, ref) {
  const text = String(ref ?? "").trim();
  if (!text) throw new Error("missing plan: give an index, an id or a title (see `lirah plans`)");
  const byIndex = /^\d+$/.test(text) ? plans[Number(text) - 1] : null;
  const plan = byIndex || plans.find((p) => p.id === text)
    || plans.find((p) => (p.title || "").toLowerCase() === text.toLowerCase());
  if (!plan) throw new Error(`no plan "${text}" (see \`lirah plans\`)`);
  return plan;
}

const isDone = (c) => c.status === "implemented" || c.status === "skipped";
const started = (plan) => plan.chunks.some((c) => c.status !== "pending" && c.status !== "skipped");
const autopilotLive = (plan) => plan.autopilot?.status === "running" || plan.autopilot?.status === "paused";

function planSummary(plan, index) {
  const active = plan.chunks.filter((c) => c.status !== "skipped");
  const done = active.filter((c) => c.status === "implemented").length;
  const total = active.length;
  const stage = plan.merged ? "merged" : plan.pr?.state === "OPEN" ? "pr-open"
    : total > 0 && done === total ? "implemented" : started(plan) ? "building" : "planned";
  // A run can't survive the app closing: the app shows it paused on load.
  const autopilot = plan.autopilot?.status === "running" ? "paused" : plan.autopilot?.status || "off";
  return {
    index, id: plan.id, title: plan.title || "(untitled)", done, total, split: plan.split, autopilot,
    file: plan.importedFrom?.path || null, stage, pr: plan.pr ?? null, merged: plan.merged ?? null,
  };
}

// As the app's replaceSource, with the split queued for the app.
function replaceSource(plan, source, importedFrom) {
  if (autopilotLive(plan)) throw new Error("stop auto-pilot before re-chunking");
  const busy = plan.chunks.find((c) => c.status === "in-progress" || c.awaitingFix);
  if (busy) throw new Error(`chunk ${busy.n} is in progress; finish or roll it back before re-chunking`);
  savePlan({
    ...plan, source, importedFrom, autopilot: null, ...(!started(plan) && { chunks: [] }),
    revisions: [...(plan.revisions ?? []), { at: Date.now(), hash: hash8(source) }],
    split: "queued", splitError: null,
  });
}

const QUEUED = "Lirah splits it into chunks when it loads this repo's plans (at once if they're open)";

function slugify(text) {
  const slug = String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length <= 30) return slug || "plan";
  const cut = slug.slice(0, 31);
  const end = cut.lastIndexOf("-");
  return (end > 0 ? cut.slice(0, end) : slug.slice(0, 30)).replace(/-+$/, "") || "plan";
}

// As buildPlanRevisePrompt and its decisionsBlock in src/features/plans/planPrompts.js.
function revisePrompt(plan, notes, path) {
  const done = plan.chunks.filter(isDone);
  const earlier = plan.chunks.filter((c) => c.status === "implemented" && (c.decisions?.length > 0 || c.result));
  const decisions = earlier.length > 0 && `Decisions from earlier chunks (follow these unless this chunk says otherwise):\n${earlier.map((c, i) => {
    const lines = [...(c.decisions ?? [])];
    if (c.result) lines.push(`(result) ${c.result}`);
    const old = i < earlier.length - 5 && lines.length > 3;
    const shown = old ? [...lines.slice(0, 3), `… ${lines.length - 3} more`] : lines;
    return `  Chunk ${c.n} (${c.title}):\n${shown.map((l) => `  - ${l}`).join("\n")}`;
  }).join("\n")}`;
  return [
    `Revise the implementation plan "${plan.title}" in ${path}.`,
    done.length > 0 && `Already done (${done.length} of ${plan.chunks.length} chunks), keep it as done and build on it:\n${done.map((c) => `- ${c.n}. ${c.title} (${c.status})`).join("\n")}`,
    decisions,
    `Changes I want:\n${notes.trim()}`,
    `Edit only ${path}. Don't implement anything and don't commit. I'll re-chunk the plan from the file once you're done.`,
  ].filter(Boolean).join("\n\n");
}

// Settings, as settingsSchema in src/features/agent-control/actions.js (from
// SETTINGS_ROWS and SETTINGS_DEFAULTS); keep in step by hand.
const CLI_IDS = ["claude-code", "opencode"];
const SETTINGS = Object.fromEntries([
  ["selectedCli", "agent", "Default CLI", "claude-code", { values: CLI_IDS, appliesTo: "new tabs" }],
  ["autoLaunchCli", "agent", "Auto-launch agent", true],
  ["agentStateHook", "agent", "Agent state hook", true, { guarded: true }],
  ["compactionHook", "agent", "Compaction hook", true, { guarded: true }],
  ["agentControl", "agent", "Agent control", true, { guarded: true }],
  ["keepFilesAfterSend", "agent", "Keep context after send", false],
  ["promptBoxOnStart", "agent", "Prompt box on new tabs", false],
  ["autoChunkTaskPlans", "agent", "Split task plans into chunks", true],
  ["showTitleBar", "appearance", "Window controls", true],
  ["figures", "appearance", "Figures", "full", { values: ["full", "compact"] }],
  ["scrollback", "terminal", "Scrollback", 10000, { values: [1000, 10000, 50000, 200000] }],
  ["autoCommitCli", "git", "Auto commit", "claude-code", { values: CLI_IDS }],
  ["autoChangelogEnabled", "git", "Auto changelog", false],
  ["sandboxEnabled", "sandbox", "Sandbox", false, { guarded: true, appliesTo: "new tabs" }],
  ["networkIsolation", "sandbox", "Network isolation", false, { guarded: true, appliesTo: "new tabs" }],
].map(([key, section, label, def, extra]) => {
  const type = extra?.values ? "choice" : typeof def === "boolean" ? "bool" : typeof def;
  return [key, { key, label, section, type, default: def, ...extra }];
}));

// Themes in src/themes/theme-config.js: [id, name]; keep in step by hand.
const THEMES = [
  ["catppuccin-mocha", "Catppuccin Mocha"], ["ristretto", "Ristretto"], ["kanagawa", "Kanagawa"],
  ["monokai", "Monokai"], ["emerald-mono", "Emerald Mono"], ["gruvbox", "Gruvbox"], ["retro", "Retro"],
  ["tokyo-night", "Tokyo Night"], ["everforest", "Everforest"], ["nord", "Nord"], ["rose-pine", "Rose Pine"],
  ["matte-black", "Matte Black"], ["hackerman", "Hackerman"], ["osaka-jade", "Osaka Jade"],
  ["ethereal", "Ethereal"], ["flexoki", "Flexoki Light"], ["catppuccin-latte", "Catppuccin Latte"],
  ["rivendell", "Rivendell"], ["lothlorien", "Lothlórien"],
];
const DEFAULT_THEME = "tokyo-night";

const settingsDoc = () => read("settings.json") ?? {};
// A stored value of the wrong type (or not allowed) reads as the default, as sanitize() does.
function settingValue(doc, entry) {
  const v = doc[entry.key];
  if (typeof v !== typeof entry.default) return entry.default;
  return entry.values && !entry.values.includes(v) ? entry.default : v;
}
const saveSettings = (doc, changes) => write("settings.json", { ...doc, ...changes }, revisionOf(doc));

function settingEntry(key) {
  if (typeof key !== "string" || !key) throw new Error("missing setting name (see `lirah settings list`)");
  const entry = SETTINGS[key];
  if (!entry) throw new Error(`unknown setting "${key}"; known: ${Object.keys(SETTINGS).join(", ")}`);
  return entry;
}

const BOOL_WORDS = { on: true, true: true, yes: true, 1: true, off: false, false: false, no: false, 0: false };

// As parseValue in actions.js.
function settingInput(entry, raw) {
  if (raw === undefined || raw === null || raw === "") throw new Error(`missing value for ${entry.key}`);
  if (entry.type === "bool") {
    if (typeof raw === "boolean") return raw;
    const word = String(raw).trim().toLowerCase();
    if (word in BOOL_WORDS) return BOOL_WORDS[word];
    throw new Error(`${entry.key} takes on/off or true/false, not "${raw}"`);
  }
  const value = typeof entry.default === "number" ? Number(String(raw).replace(/[,_]/g, "")) : String(raw).trim();
  if (!entry.values.includes(value)) throw new Error(`${entry.key} must be one of ${entry.values.join(", ")}, not "${raw}"`);
  return value;
}

// Sandbox, network isolation, the hooks and agent control are confirmed by the user in the app.
function changeSetting(entry, value, verb) {
  if (entry.guarded) {
    throw new Error(`${entry.key} is a sensitive setting: Lirah asks the user before changing it, so it can only be ${verb} while Lirah is running (run this from a Lirah tab, or change it in Settings)`);
  }
  const doc = settingsDoc();
  if (Object.is(settingValue(doc, entry), value)) return `${entry.key} is already ${show(value)}`;
  saveSettings(doc, { [entry.key]: value });
  return `${entry.key} = ${show(value)}${entry.appliesTo ? " (new tabs)" : ""}`;
}

const themeOf = (doc) => (THEMES.some(([id]) => id === doc.theme) ? doc.theme : DEFAULT_THEME);

const startupOf = (doc) => ({
  mode: doc.startupMode === "projects" ? "projects" : "restore",
  // As cleanStartupProject in settingsStore.js.
  projects: (Array.isArray(doc.startupProjects) ? doc.startupProjects : [])
    .filter((p) => p && typeof p === "object" && typeof p.path === "string" && p.path.trim())
    .map((p) => ({ path: p.path, ...(typeof p.name === "string" && { name: p.name }), ...(typeof p.launch === "boolean" && { launch: p.launch }) })),
});

// [dispatcher cmd] -> (args, positional) => reply data, as the app's handler.
const LOCAL = {
  "settings.list": () => {
    const doc = settingsDoc();
    return Object.values(SETTINGS).map((e) => ({ ...e, value: settingValue(doc, e) }));
  },
  "settings.get": (args, [key = args.key]) => settingValue(settingsDoc(), settingEntry(key)),
  "settings.set": (args, [key = args.key, value = args.value]) => {
    const entry = settingEntry(key);
    return changeSetting(entry, settingInput(entry, value), "set");
  },
  "settings.reset": (args, [key = args.key]) => {
    const entry = settingEntry(key);
    return changeSetting(entry, entry.default, "reset");
  },
  "theme.list": () => {
    const current = themeOf(settingsDoc());
    return THEMES.map(([id, name]) => ({ id, name, current: id === current }));
  },
  "theme.get": () => themeOf(settingsDoc()),
  "theme.set": (args, [name = args.name]) => {
    if (typeof name !== "string" || !name.trim()) throw new Error("missing theme name (see `lirah theme list`)");
    const wanted = name.trim().toLowerCase();
    const id = THEMES.find(([k, n]) => k.toLowerCase() === wanted || n.toLowerCase() === wanted)?.[0];
    if (!id) throw new Error(`unknown theme "${name}"; known: ${THEMES.map(([k]) => k).join(", ")}`);
    const doc = settingsDoc();
    if (themeOf(doc) === id) return `theme is already ${id}`;
    saveSettings(doc, { theme: id });
    return `theme = ${id}`;
  },
  "startup.get": () => startupOf(settingsDoc()),
  "startup.mode": (args, [raw = args.mode]) => {
    const doc = settingsDoc();
    const { mode: previous, projects } = startupOf(doc);
    if (raw === undefined) return previous;
    const mode = String(raw).trim().toLowerCase();
    if (mode !== "restore" && mode !== "projects") throw new Error(`startup mode must be restore or projects, not "${raw}"`);
    if (mode === previous) return `startup mode is already ${mode}`;
    saveSettings(doc, { startupMode: mode });
    const note = mode === "projects" && !projects.length
      ? " (no startup projects yet, so the last tabs still restore; add some with `lirah startup add`)" : "";
    return `startup mode = ${mode}${note}`;
  },
  // The path is checked and made absolute in route().
  "startup.add": (args, [raw = args.path]) => {
    const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
    const doc = settingsDoc();
    const { mode, projects } = startupOf(doc);
    const index = projects.findIndex((p) => p.path === path);
    const entry = { ...(index === -1 ? { path } : projects[index]) };
    const launch = args.launch === undefined ? undefined : args.launch === true || args.launch === "true" || args.launch === "on" || args.launch === 1;
    if (launch !== undefined) {
      if (launch) entry.launch = true;
      else delete entry.launch;
    }
    if (args.name !== undefined) {
      const label = String(args.name).trim();
      if (label) entry.name = label;
      else delete entry.name;
    }
    saveSettings(doc, { startupProjects: index === -1 ? [...projects, entry] : projects.map((p, i) => (i === index ? entry : p)) });
    const what = `${entry.path}${entry.name ? ` as "${entry.name}"` : ""}${entry.launch ? ", launching its agent" : ""}`;
    const note = mode === "projects" ? "" : " (startup mode is restore; `lirah startup mode projects` to use it)";
    return `${index === -1 ? "added" : "updated"} ${what}${note}`;
  },
  "startup.remove": (args, [raw = args.path]) => {
    const path = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
    const doc = settingsDoc();
    const { projects } = startupOf(doc);
    const removed = projects.find((p) => p.path === path);
    if (!removed) throw new Error(`not a startup project: ${path} (see \`lirah startup\`)`);
    saveSettings(doc, { startupProjects: projects.filter((p) => p !== removed) });
    return `removed ${removed.path}`;
  },
  "startup.clear": () => {
    const doc = settingsDoc();
    const count = startupOf(doc).projects.length;
    if (!count) return "no startup projects to clear";
    saveSettings(doc, { startupProjects: [] });
    return `cleared ${count} startup project${count === 1 ? "" : "s"}`;
  },
  "tasks.list": (args) => {
    const scope = taskScope(args);
    return {
      scope: scope === GLOBAL ? "global" : "workspace",
      tasks: readTasks(scope).tasks.map(({ id, title, notes, status }) => ({ id, title, notes, status })),
    };
  },
  "tasks.add": (args, words) => {
    const [first = "", ...more] = (words.length ? words.join(" ") : String(args.title ?? "")).trim().split("\n");
    const title = first.replace(/^#+\s*/, "").trim();
    const notes = [more.join("\n").trim(), args.notes === undefined ? "" : String(args.notes)].filter(Boolean).join("\n\n").trim();
    if (!title) throw new Error("missing title: lirah tasks add <title> [--notes N] [--global]");
    const scope = taskScope(args);
    const { tasks, revision } = readTasks(scope);
    const now = Date.now();
    const task = {
      id: shortId("t"), title, notes, status: "backlog", repos: scope === GLOBAL ? [] : [repoRoot()],
      planPath: null, planId: null, planTabId: null, autoChunk: false, createdAt: now, updatedAt: now,
    };
    write(taskFile(scope), { scope, tasks: [task, ...tasks] }, revision);
    return `added task ${task.id} to ${where(scope)}`;
  },
  "tasks.done": (args, [id = args.id]) => {
    if (!id) throw new Error("missing task id (see `lirah tasks`)");
    const scope = taskScope(args);
    const { tasks, revision } = readTasks(scope);
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`no task ${id} in ${where(scope)} (see \`lirah tasks${scope === GLOBAL ? " --global" : ""}\`)`);
    if (task.status === "done") return `${id} is already done`;
    const next = tasks.map((t) => (t === task ? { ...t, status: "done", updatedAt: Date.now() } : t));
    write(taskFile(scope), { scope, tasks: next }, revision);
    return `${id} done`;
  },
  "plans.list": () => {
    const repo = repoRoot();
    return { repo, plans: repoPlans(repo).map((p, i) => planSummary(p, i + 1)) };
  },
  "plans.show": (args, [ref = args.plan]) => {
    const plans = repoPlans(repoRoot());
    const plan = findPlan(plans, ref);
    const state = (c) => (c.needsCommit ? "no-commit" : c.awaitingFix ? "fixing" : c.status);
    return {
      ...planSummary(plan, plans.indexOf(plan) + 1),
      summary: plan.summary || "",
      chunks: plan.chunks.map((c) => ({ n: c.n, id: c.id, state: state(c), title: c.title || "" })),
    };
  },
  "plans.import": (args, [path = args.path]) => {
    const repo = repoRoot();
    let source;
    try {
      source = readFileSync(path, "utf8");
    } catch (e) {
      throw new Error(`can't read ${path} (${e.code || e.message})`);
    }
    if (!source.trim()) throw new Error(`${path} is empty`);
    const importedFrom = { path, hash: hash8(source) };
    const existing = repoPlans(repo).find((p) => p.importedFrom?.path === path);
    if (existing?.importedFrom.hash === importedFrom.hash) return `already imported as ${existing.id}`;
    if (existing) {
      replaceSource(existing, source, importedFrom); // keeps the chunks already done
      return `updated ${existing.id}; ${QUEUED}`;
    }
    const title = /^#\s+(.+)$/m.exec(source)?.[1].trim() || "";
    const slug = slugify(title);
    const now = Date.now();
    const plan = {
      id: shortId("p"), slug, title, summary: "", repoRoot: repo, workspaceId: workspace(), source, importedFrom,
      split: "queued", splitError: null, chunks: [],
      // As defaultGitConfig in planModel.js.
      git: {
        worktrees: false, branch: `plan/${slug}`, workDir: null, preparedAt: null,
        repos: [{ root: repo, base: gitOut(repo, ["rev-parse", "--abbrev-ref", "HEAD"]), workPath: null, prepared: false }],
      },
      createdAt: now, updatedAt: now,
    };
    write(`workspaces/${plan.workspaceId}/plans/${plan.id}/plan.json`, plan, 0);
    return `imported ${plan.id}; ${QUEUED}`;
  },
  "plans.revise": (args, [ref = args.plan, ...words]) => {
    const repo = repoRoot();
    const plan = findPlan(repoPlans(repo), ref);
    const notes = words.join(" ").trim() || String(args.notes ?? "").trim();
    if (!notes) throw new Error("say what should change: lirah plans revise <plan> <notes>");
    // As ensurePlanFile: the plan's file, written from plan.source if it was pasted in.
    const known = plan.importedFrom?.path;
    let path = known;
    if (!known || !existsSync(known)) {
      path = known || `${repo}/${plan.slug}_plan.md`;
      if (!known && existsSync(path)) path = `${repo}/${plan.slug}-${plan.id}_plan.md`;
      writeFileSync(path, plan.source);
      savePlan({ ...plan, importedFrom: { path, hash: hash8(plan.source) } });
    }
    return `${revisePrompt(plan, notes, path)}\n\nWhen the file is updated, run \`lirah plans rechunk ${plan.id}\`.`;
  },
  "plans.rechunk": (args, [ref = args.plan]) => {
    const plan = findPlan(repoPlans(repoRoot()), ref);
    const path = plan.importedFrom?.path;
    let source = null;
    try {
      if (path) source = readFileSync(path, "utf8");
    } catch {
      // the file is gone: re-chunk from plan.source
    }
    replaceSource(plan, source ?? plan.source, source != null ? { path, hash: hash8(source) } : plan.importedFrom ?? null);
    return `re-chunk of ${plan.id} queued; ${QUEUED}`;
  },
  // The app checks the chunk's commits first (they win), so it only asks: doneRequested.
  "plans.done": (args, [planRef = args.plan, chunkRef = args.chunk]) => {
    const plan = findPlan(repoPlans(repoRoot()), planRef);
    const text = String(chunkRef ?? "").trim();
    const chunk = plan.chunks.find((c) => c.id === text || String(c.n) === text);
    if (!chunk) throw new Error(`no chunk "${text}" in ${plan.title || plan.id} (see \`lirah plans show\`)`);
    if (chunk.status === "implemented") return `chunk ${chunk.n} is already implemented`;
    if (chunk.status !== "in-progress") {
      throw new Error(`chunk ${chunk.n} is ${chunk.status}; only a chunk in progress (sent from the plans pane) can be marked done`);
    }
    const result = args.result === undefined ? null : String(args.result);
    savePlan({ ...plan, chunks: plan.chunks.map((c) => (c === chunk ? { ...c, doneRequested: { result } } : c)) });
    return `chunk ${chunk.n} will be marked done when Lirah loads this repo's plans, at once if they're open (its commits are checked first)`;
  },
};

// The app's reply, or with the app closed the local handler's.
async function run(name, args) {
  const local = LOCAL[name];
  const data = await request(name, args, { fallback: !!local });
  if (data !== UNREACHABLE) return data;
  // A running app that this shell can't reach picks the file edits up (it watches ~/.lirah).
  try {
    if (read("settings.json")?.agentControl === false) fail("agent control is off in Lirah's settings (Agent → Agent control)");
    return local(args, args._);
  } catch (e) {
    fail(e.message);
  }
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
const data = await run(name, args);
if (json) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
} else if (data !== null) {
  const text = format(data);
  if (text !== "") process.stdout.write(text + "\n");
}
process.exit(process.exitCode ?? 0);
