#!/usr/bin/env node
// Seeds fictional bank alerts into the dedicated Kanakku_API_36 emulator for store screenshots and
// demo videos. Refuses any other device. `--cleanup` deletes exactly the rows a previous run added.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { demoMessages } from "../tests/android/demo/fixtures.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const serial = "emulator-5580";
const adb = process.env.ADB || "/opt/homebrew/share/android-commandlinetools/platform-tools/adb";
const ledger = join(root, "artifacts/play/video/seeded-sms.json");
const q = (s) => "'" + String(s).replaceAll("'", "'\\''") + "'";
const shell = (cmd) => {
  const r = spawnSync(adb, ["-s", serial, "shell", cmd], { encoding: "utf8" });
  if (r.status !== 0 || /Exception/.test(r.stderr)) throw new Error(`adb failed: ${r.stderr}`);
  return r.stdout.trim();
};
const avd = spawnSync(adb, ["-s", serial, "emu", "avd", "name"], { encoding: "utf8" }).stdout.split("\n")[0].trim();
if (avd !== "Kanakku_API_36") throw new Error(`Refusing ${serial}: AVD is '${avd}'`);
spawnSync(adb, ["-s", serial, "root"]);
spawnSync("sleep", ["2"]);
if (shell("id -u") !== "0") throw new Error("adb root is required to write the SMS provider");

const where = (m) => `address='${m.sender}' AND body='${m.body.replaceAll("'", "''")}' AND date=${m.date}`;
if (process.argv.includes("--cleanup")) {
  if (!existsSync(ledger)) { console.log("Nothing to clean up."); process.exit(0); }
  for (const m of JSON.parse(readFileSync(ledger, "utf8"))) shell(`content delete --uri content://sms --where ${q(where(m))}`);
  rmSync(ledger);
  console.log("Removed seeded demo SMS.");
  process.exit(0);
}
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const now = Number(shell("date +%s")) * 1000;
const inserted = [];
for (const [i, m] of demoMessages.entries()) {
  const at = new Date(now - m.daysAgo * 86400000 - (i % 7) * 3600000);
  const due = new Date(now + 6 * 86400000);
  const body = m.body
    .replace("DD-MM-YY", `${pad(at.getDate())}-${pad(at.getMonth() + 1)}-${String(at.getFullYear()).slice(2)}`)
    .replace("DDMonYY", `${pad(at.getDate())}${months[at.getMonth()]}${String(at.getFullYear()).slice(2)}`)
    .replace("DD-Mon", `${pad(at.getDate())}-${months[at.getMonth()]}`)
    .replace("DUE", `${pad(due.getDate())}-${pad(due.getMonth() + 1)}-${String(due.getFullYear()).slice(2)}`);
  const row = { sender: m.sender, body, date: at.getTime() };
  // `content --bind` splits on unescaped colons, so times, "Due on:" and URLs must be escaped.
  shell(`content insert --uri content://sms/inbox --bind address:s:${q(row.sender)} --bind body:s:${q(row.body.replaceAll(":", "\\:"))} --bind date:l:${row.date} --bind read:i:1`);
  inserted.push(row);
}
writeFileSync(ledger, JSON.stringify(inserted, null, 1));
const stored = shell("content query --uri content://sms/inbox --projection _id").split("\n").filter((l) => l.startsWith("Row")).length;
if (stored < inserted.length) throw new Error(`Only ${stored} of ${inserted.length} demo alerts reached the SMS provider`);
console.log(`Seeded ${inserted.length} fictional bank alerts. Clean up with --cleanup.`);
