// Pairs an Android 11+ phone with this computer over Wi-Fi using the phone's
// "Pair device with QR code" scanner, then connects ADB to it.
// Usage: npm run adb:pair   (phone and computer on the same Wi-Fi network)
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import qrcode from "qrcode-terminal";

const adb = (...args) =>
  execFileSync("adb", args, { encoding: "utf8", timeout: 20_000 }).trim();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const deadline = Date.now() + 120_000;

// The same payload Android Studio shows; the phone advertises a pairing
// service with this name over mDNS after scanning it.
const name = `kanakku-${randomBytes(4).toString("hex")}`;
const password = randomBytes(6).toString("hex");
qrcode.generate(`WIFI:T:ADB;S:${name};P:${password};;`, { small: true });
console.log(`On the phone: Settings › Developer options › Wireless debugging
  › Pair device with QR code, then scan the code above.
Waiting up to 2 minutes for the phone (service ${name})…`);

const find = (type, match) => {
  for (const line of adb("mdns", "services").split("\n")) {
    const [service, kind, address] = line.trim().split(/\s+/);
    if (kind === type && address && match(service, address)) return address;
  }
  return undefined;
};

let pairing;
while (!pairing && Date.now() < deadline) {
  pairing = find("_adb-tls-pairing._tcp", (service) => service === name);
  if (!pairing) await sleep(1000);
}
if (!pairing) {
  console.error(
    "The phone did not appear. Check both devices share one Wi-Fi network (no guest/client isolation), Wireless debugging is on, and `adb mdns check` reports a daemon.",
  );
  process.exit(1);
}
const result = adb("pair", pairing, password);
console.log(result);
if (!/Successfully paired/i.test(result)) process.exit(1);

// Pairing is remembered; connection uses a different, changing port.
const host = pairing.split(":")[0];
let connect;
while (!connect && Date.now() < deadline + 30_000) {
  connect = find(
    "_adb-tls-connect._tcp",
    (_service, address) => address.split(":")[0] === host,
  );
  if (!connect) await sleep(1000);
}
if (connect) console.log(adb("connect", connect));
console.log(adb("devices", "-l"));
