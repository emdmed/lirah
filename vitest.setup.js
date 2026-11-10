// Backstop: no test may reach the real home (~/.lirah). Every test file gets a
// fresh temp home; children the tests spawn inherit it. os.homedir() reads
// USERPROFILE on Windows and HOME elsewhere.
import { afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, parse } from "node:path";

const realHome = homedir();
const home = mkdtempSync(join(tmpdir(), "lirah-test-home-"));
Object.assign(process.env, { HOME: home, USERPROFILE: home, HOMEDRIVE: parse(home).root.replace(/[\/]$/, ""), HOMEPATH: home.slice(parse(home).root.length - 1) });
if (homedir() === realHome) throw new Error(`tests must not run against the real home (${realHome})`);

afterAll(() => rmSync(home, { recursive: true, force: true }));
