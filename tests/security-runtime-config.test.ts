import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("declares a Node runtime that supports native TypeScript stripping", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    engines?: { node?: string };
  };

  assert.equal(packageJson.engines?.node, ">=22.6");
});

test("configures baseline response hardening without a brittle script CSP", () => {
  const nextConfig = readFileSync("next.config.ts", "utf8");

  assert.equal(nextConfig.includes("poweredByHeader: false"), true);
  assert.equal(nextConfig.includes("X-Content-Type-Options"), true);
  assert.equal(nextConfig.includes("Referrer-Policy"), true);
  assert.equal(nextConfig.includes("Permissions-Policy"), true);
  assert.equal(nextConfig.includes("Content-Security-Policy"), false);
});

test("prevents duplicate chapter work for one translated book", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const translationTaskModel = schema.match(/model TranslationTask \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.equal(translationTaskModel.includes("@@unique([translatedBookId, chapterId])"), true);
});
