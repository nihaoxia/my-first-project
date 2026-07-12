import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScopedLocalStorageKey,
  deriveLocalStorageScope,
} from "../src/lib/storage/local-storage-scope.ts";

test("derives stable, account-specific local storage scopes without exposing phone numbers", () => {
  const accountA = deriveLocalStorageScope("13811112222");
  const accountAAgain = deriveLocalStorageScope(" 13811112222 ");
  const accountB = deriveLocalStorageScope("13933334444");

  assert.equal(accountA, accountAAgain);
  assert.notEqual(accountA, accountB);
  assert.equal(accountA.includes("13811112222"), false);
  assert.match(accountA, /^user-[a-z0-9-]+$/);
});

test("appends the user scope to every browser persistence key", () => {
  assert.equal(
    buildScopedLocalStorageKey("stray-pages.local-library-books", "user-abc123"),
    "stray-pages.local-library-books.user-abc123",
  );
});
