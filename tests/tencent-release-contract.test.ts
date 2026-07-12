import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const path = "deploy/tencent-cloud/release.sh";

test("Tencent release accepts only immutable Git SHA image tags", () => {
  const script = readFileSync(path, "utf8");
  assert.match(script, /^set -eu$/m);
  assert.doesNotMatch(script, /set -x/);
  assert.match(script, /\[!0-9a-fA-F\]/);
  assert.match(script, /\$\{#RELEASE_SHA\}.*40|40.*\$\{#RELEASE_SHA\}/);
  assert.match(script, /latest/);
  assert.match(script, /docker compose[\s\S]*?config --quiet/);
  assert.match(script, /export RELEASE_SHA/);
});

test("release applies the authoritative migration before updating services", () => {
  const script = readFileSync(path, "utf8");
  const postgresStart = script.indexOf("up -d --wait --wait-timeout");
  const migration = script.indexOf('cat "$MIGRATION_FILE"');
  const fullUpdate = script.lastIndexOf("up -d --wait --wait-timeout");
  assert.ok(postgresStart >= 0);
  assert.ok(migration > postgresStart);
  assert.ok(fullUpdate > migration);
  assert.match(script, /supabase_migrations/);
  assert.match(script, /ON_ERROR_STOP/);
  assert.doesNotMatch(script, /prisma db push/);
});

test("release has bounded image-only rollback and atomic root-only state", () => {
  const script = readFileSync(path, "utf8");
  assert.match(script, /PREVIOUS_SHA/);
  assert.match(script, /ROLLBACK_SHA/);
  assert.match(script, /wait-timeout/);
  assert.match(script, /umask 077/);
  assert.match(script, /chmod 600/);
  assert.match(script, /mv .*STATE_FILE/);
  assert.match(script, /does not roll back|not roll back/i);
  assert.doesNotMatch(script, /env\s|printenv|docker compose config(?! --quiet)/);
});
