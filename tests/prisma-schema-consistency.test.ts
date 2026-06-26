import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DEFAULT_FREE_STANDARD_UNITS_PER_USER } from "../src/lib/account/mock-account-summary.ts";
import { uploadFilePolicy } from "../src/lib/upload/file-policy.ts";

test("Prisma BookFormat enum matches supported upload formats", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const enumBody = schema.match(/enum BookFormat \{(?<body>[\s\S]*?)\}/)?.groups?.body ?? "";

  for (const format of uploadFilePolicy.supportedFormats) {
    assert.match(enumBody, new RegExp(`\\b${format.label}\\b`));
  }
});

test("Prisma free chapter default matches the user-facing free quota", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");

  assert.match(schema, new RegExp(`freeChapters\\s+Int\\s+@default\\(${DEFAULT_FREE_STANDARD_UNITS_PER_USER}\\)`));
});
