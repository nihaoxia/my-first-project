import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies?: Record<string, string>;
};
const lockfile = readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8");

test("pins the EPUB archive and XML parsers to reviewed exact versions", () => {
  assert.equal(packageJson.dependencies?.fflate, "0.8.3");
  assert.equal(packageJson.dependencies?.["@xmldom/xmldom"], "0.9.10");

  for (const name of ["fflate", "@xmldom/xmldom"] as const) {
    const version = packageJson.dependencies?.[name] ?? "";
    assert.doesNotMatch(version, /[~^*]|workspace:|https?:|git(?:hub)?:/u);
  }
});

test("records the reviewed EPUB parser versions in the pnpm lockfile", () => {
  assert.match(lockfile, /fflate:\s*\n\s*specifier: 0\.8\.3\s*\n\s*version: 0\.8\.3/u);
  assert.match(
    lockfile,
    /'@xmldom\/xmldom':\s*\n\s*specifier: 0\.9\.10\s*\n\s*version: 0\.9\.10/u,
  );
});
