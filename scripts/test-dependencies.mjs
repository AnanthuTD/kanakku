import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import upstream from "../vendor/decode-uri-component/upstream-index.mjs";

// An alternate directory supports isolated compatibility installs without
// mutating this application's lockfile or concurrently running Expo builds.
const consumerRoot = process.env.KANAKKU_DEPENDENCY_TEST_ROOT || process.cwd();
const consumerRequire = createRequire(
  join(resolve(consumerRoot), "package.json"),
);
const queryPath = consumerRequire.resolve("query-string");
const queryString = consumerRequire("query-string");
const decoder = createRequire(queryPath)("decode-uri-component");
const localRequire = createRequire(import.meta.url);
const adapter = localRequire("../vendor/decode-uri-component/index.cjs");

test("CommonJS adapter matches verified upstream source exactly apart from exports", () => {
  const source = readFileSync(
    new URL(
      "../vendor/decode-uri-component/upstream-index.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa",
  );
  assert.equal(
    readFileSync(
      new URL("../vendor/decode-uri-component/index.cjs", import.meta.url),
      "utf8",
    ),
    source.replace(
      "export default function decodeUriComponent(encodedURI)",
      "function decodeUriComponent(encodedURI)",
    ) + "\nmodule.exports = decodeUriComponent;\n",
  );
});

test("callable decoder preserves upstream Unicode, malformed sequences and type errors", () => {
  assert.equal(typeof decoder, "function");
  for (const input of [
    "",
    "hello+world",
    "%E0%B4%95%E0%B4%A3%E0%B4%95%E0%B5%8D%E0%B4%95%E0%B5%8D",
    "%F0%9F%8C%BF",
    "prefix%FF%41%C2suffix",
    "%FE%FF%FF%FE",
    "%C0%AF%ED%A0%80",
    "%E0%A4%A",
    "%GG",
    "%",
    "%E2%82%AC%FF%F0%9F%8C%BF",
  ]) {
    assert.equal(adapter(input), upstream(input), input);
    assert.equal(decoder(input), upstream(input), input);
  }
  for (const input of [undefined, null, 7, {}])
    assert.throws(() => decoder(input), TypeError);
});

test("actual query-string parses Unicode, plus spaces, duplicate params and null flags", () => {
  const parsed = queryString.parse(
    "merchant=%E0%B4%95%E0%B4%A3%E0%B4%95%E0%B5%8D%E0%B4%95%E0%B5%8D&note=auto+to+office&kind=purchase&kind=refund&flag&empty=",
  );
  assert.deepEqual(
    { ...parsed },
    {
      merchant: "കണക്ക്",
      note: "auto to office",
      kind: ["purchase", "refund"],
      flag: null,
      empty: "",
    },
  );
  assert.deepEqual(
    {
      ...queryString.parse("tags[]=food&tags[]=transport", {
        arrayFormat: "bracket",
      }),
    },
    { tags: ["food", "transport"] },
  );
  assert.deepEqual(
    { ...queryString.parse("bad=%FF%41%C2&valid=%E2%82%AC") },
    { bad: "%FFA�", valid: "€" },
  );
});

test("query-string parseUrl and stringify retain notification-link query semantics", () => {
  const parsed = queryString.parseUrl(
    "kanakku://review?id=fixture%2F1&voice=1#details",
  );
  assert.equal(parsed.url, "kanakku://review");
  assert.deepEqual({ ...parsed.query }, { id: "fixture/1", voice: "1" });
  const encoded = queryString.stringify({
    id: "fixture/1",
    note: "auto to office",
    tag: ["food", "transport"],
  });
  assert.deepEqual(
    { ...queryString.parse(encoded) },
    { id: "fixture/1", note: "auto to office", tag: ["food", "transport"] },
  );
});

test("malformed UTF8 advisory inputs finish in a bounded isolated consumer process", () => {
  // Do not let a decoder regression freeze the regression runner. The child
  // uses the actual installed consumer and asserts full output without trimming.
  const code = `const assert=require('node:assert/strict'); const q=require(process.argv[1]);
    const invalid='%FF'.repeat(30000); assert.equal(q.parse('value='+invalid).value, invalid);
    const incomplete='%C2'.repeat(30000); assert.equal(q.parse('value='+incomplete).value, '�'.repeat(30000));
    const mixed='%41%FF'.repeat(10000); assert.equal(q.parse('value='+mixed).value, 'A%FF'.repeat(10000));`;
  const result = spawnSync(process.execPath, ["-e", code, queryPath], {
    timeout: 4000,
    encoding: "utf8",
    maxBuffer: 4096,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test("xcode project generation retains compatible CommonJS UUID v4 identifiers", () => {
  const xcode = consumerRequire("xcode");
  const project = xcode.project("/tmp/kanakku-uuid-fixture.pbxproj");
  project.hash = { project: { objects: { PBXGroup: {} } } };
  const ids = new Set(
    Array.from({ length: 100 }, () => project.generateUuid()),
  );
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, /^[A-F0-9]{24}$/);
});
