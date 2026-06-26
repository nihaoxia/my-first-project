import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("proxy matcher includes every protected top-level route", () => {
  const proxySource = readFileSync("src/proxy.ts", "utf8");

  for (const matcher of [
    "/library/:path*",
    "/upload/:path*",
    "/books/:path*",
    "/translations/:path*",
    "/reader/:path*",
    "/study/:path*",
    "/me/:path*",
    "/admin/:path*",
  ]) {
    assert.match(proxySource, new RegExp(`"${escapeRegExp(matcher)}"`));
  }
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
