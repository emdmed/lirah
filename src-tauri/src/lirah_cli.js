// `lirah` CLI (installed by Lirah): lets the agent in a Lirah tab configure
// Lirah. Sends one request to the app's control socket ($LIRAH_CONTROL) and
// prints the reply.
//
//   lirah <cmd> [positional...] [--key value | --key=value | --flag]
//
// Positionals go in args._; flag values are parsed as JSON when they parse
// (numbers, booleans, objects), else kept as strings. A bare --flag is true.
import { connect } from "node:net";

const CLIENT_TIMEOUT_MS = 70_000; // the app gives up on its side after 60 s

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

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "--help" || cmd === "-h") {
  process.stdout.write("usage: lirah <command> [args...]\n  lirah ping   check that Lirah is reachable\n");
  process.exit(cmd ? 0 : 1);
}

const socketPath = process.env.LIRAH_CONTROL;
if (!socketPath) fail("not running inside a Lirah tab (LIRAH_CONTROL is unset)");

const request = {
  session: process.env.LIRAH_PTY_SESSION || null,
  cmd,
  args: parseArgs(rest),
};

let buffer = "";
const socket = connect(socketPath);
socket.setEncoding("utf8");
socket.setTimeout(CLIENT_TIMEOUT_MS, () => {
  socket.destroy();
  fail("Lirah didn't answer in time");
});
socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
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
  const data = reply.data;
  if (data === null || data === undefined) process.exit(0);
  process.stdout.write((typeof data === "string" ? data : JSON.stringify(data, null, 2)) + "\n");
  process.exit(0);
});
