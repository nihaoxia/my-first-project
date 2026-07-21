import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }

test("study pages resolve one authoritative persistence mode and load cloud rows server-side", () => {
  for (const page of ["src/app/study/vocabulary/page.tsx", "src/app/study/sentences/page.tsx", "src/app/study/notes/page.tsx"]) {
    const text = source(page);
    assert.match(text, /resolveCloudPersistenceModeFromEnvironment\(process\.env\)/);
    assert.match(text, /getCloudStudyService\(\)\.list\(session\.user\.id/);
    assert.match(text, /initialNextCursor/);
    assert.match(text, /persistence=\{persistence\}/);
  }
});

test("cloud study UI can load additional cursor pages and exports use a bounded full scan", () => {
  for (const path of ["src/components/study/vocabulary-workspace.tsx", "src/components/study/sentences-workspace.tsx", "src/components/study/notes-workspace.tsx"]) {
    const text = source(path);
    assert.match(text, /initialNextCursor/);
    assert.match(text, /cursor=\$\{encodeURIComponent\(nextCursor\)\}/);
    assert.match(text, /加载更多/);
  }
  const core = source("src/lib/cloud/study-core.ts");
  assert.match(core, /MAX_STUDY_EXPORT_ITEMS = 10_000/);
  assert.match(core, /listAllStudyItemsForExport/);
  assert.match(core, /STUDY_EXPORT_LIMIT/);
  for (const page of ["src/app/study/vocabulary/page.tsx", "src/app/study/sentences/page.tsx", "src/app/study/notes/page.tsx"]) {
    const text = source(page);
    assert.match(text, /listAllStudyItemsForExport/);
    assert.match(text, /STUDY_EXPORT_LIMIT/);
    assert.match(text, /超过 10000 条/);
  }
});

test("cloud study workspaces do not subscribe to or merge local storage", () => {
  for (const path of ["src/components/study/vocabulary-workspace.tsx", "src/components/study/sentences-workspace.tsx", "src/components/study/notes-workspace.tsx"]) {
    const text = source(path);
    assert.match(text, /persistence === "local" \? subscribe/);
    assert.match(text, /persistence === "cloud"/);
    assert.match(text, /\/api\/cloud\/study/);
  }
});

test("cloud reader restores and persists DB reading state and selections", () => {
  const server = source("src/components/cloud/cloud-translation-reader.tsx");
  const client = source("src/components/reader/reader-workspace.tsx");
  assert.match(server, /kind: "reading", bookId: translation\.id/);
  assert.match(server, /initialParagraphIndex=\{restoredParagraphIndex\}/);
  assert.match(client, /persistence === "local" \? subscribeToReaderSelections : subscribeNoop/);
  assert.match(client, /translatedBookId: cloudSource\.translatedBookId/);
  assert.match(client, /paragraphIndex/);
  assert.match(client, /response\.status === 409/);
  assert.match(client, /conflict: \{ version/);
  assert.doesNotMatch(client, /response = await send\(version/);
  assert.match(client, /progressCanRetry/);
  assert.match(client, /progressCanRetry \? .*readingQueueRef\.current\?\.retry/);
});

test("local import keeps source copies and writes marker only after complete results", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  assert.match(text, /prepared\.unresolved === 0 && totals\.conflicts === 0 && totals\.errors === 0/);
  assert.match(text, /runImportChunks\(prepared\.items/);
  assert.match(text, /readLegacyLocalStorage/);
  assert.match(text, /writeScopedLocalStorage\(\s*cloudImportMarkerStorageKey/);
  assert.doesNotMatch(text, /removeScopedLocalStorage|localStorage\.removeItem/);
  assert.match(text, /本地副本未删除/);
});

test("local import inspects only current and unscoped fixed sources", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  assert.match(text, /current-supabase-scope/);
  assert.match(text, /legacy-unscoped/);
  assert.doesNotMatch(text, /legacy-mock-scope/);
  assert.doesNotMatch(text, /deriveLocalStorageScope/);
  assert.match(text, /readScopedLocalStorage/);
  assert.match(text, /readLegacyLocalStorage\(storage, key, null\)/);
  assert.doesNotMatch(text, /localStorage\.length|localStorage\.key\s*\(/);
});

test("local import separates inspection preview confirmation and execution", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  assert.match(text, /检查本地学习数据/);
  assert.match(text, /生成导入预览/);
  assert.match(text, /我了解本地副本不会删除/);
  assert.match(text, /导入所选数据/);
  assert.doesNotMatch(text, /window\.confirm/);
  assert.match(text, /setPreviewCandidate\(null\)/);
  assert.match(text, /setConfirmed\(false\)/);
  assert.match(text, /<fieldset/);
  assert.match(text, /<legend/);
});

test("local import rechecks snapshots before the first network request", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  const handler = text.slice(text.indexOf("async function handleImport"));
  const recheck = handler.indexOf("recheckSelectedSourceSnapshots");
  const fetchCall = handler.indexOf('fetch("/api/cloud/import"');
  assert.ok(recheck >= 0 && fetchCall > recheck);
  assert.match(text, /SOURCE_DATA_CHANGED/);
  assert.match(text, /readCurrentScopeFingerprint/);
  assert.match(text, /"X-Stray-Pages-Import-Binding": sessionBinding/);
});

test("completion markers do not permanently block future inspections", () => {
  const text = source("src/components/cloud/cloud-local-import-panel.tsx");
  assert.match(text, /writeScopedLocalStorage\(\s*cloudImportMarkerStorageKey/);
  assert.doesNotMatch(text, /existingMarker/);
  assert.doesNotMatch(text, /removeScopedLocalStorage|localStorage\.removeItem/);
});

test("mounts local-to-cloud migration only from the authenticated cloud account page", () => {
  const mePage = source("src/app/me/page.tsx");
  const notesPage = source("src/app/study/notes/page.tsx");
  const panel = source("src/components/cloud/cloud-local-import-panel.tsx");

  assert.match(mePage, /resolveCloudPersistenceModeFromEnvironment\(process\.env\)/);
  assert.match(mePage, /persistence === "cloud"/);
  assert.match(mePage, /getCloudImportSessionBinding/);
  assert.match(mePage, /<CloudLocalImportPanel sessionBinding=\{importBinding\}\s*\/>/);
  assert.match(mePage, /<AppShell requireAuth>/);
  assert.doesNotMatch(mePage, /<CloudLocalImportPanel[^>]*(userId|legacyMockUserId)/);
  assert.doesNotMatch(notesPage, /CloudLocalImportPanel/);
  assert.match(panel, /export function CloudLocalImportPanel\(\{ sessionBinding \}/);
});
