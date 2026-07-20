import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelPath = "src/components/account/local-data-backup-panel.tsx";
const panel = readFileSync(panelPath, "utf8");
const mePage = readFileSync("src/app/me/page.tsx", "utf8");

test("mounts a client-only local backup panel on the authenticated me page", () => {
  assert.match(panel, /^"use client";/u);
  assert.match(mePage, /import \{ LocalDataBackupPanel \}/u);
  assert.match(mePage, /<LocalDataBackupPanel\s*\/>/u);
  assert.match(mePage, /<AppShell requireAuth>/u);
  assert.doesNotMatch(mePage, /localStorage|crypto\.subtle|备份口令/u);
});

test("reads only the six fixed scoped keys without enumerating storage", () => {
  assert.match(panel, /localBackupStorageEntries/u);
  assert.match(panel, /buildScopedLocalStorageKey/u);
  assert.match(panel, /safeReadLocalStorage/u);
  assert.match(panel, /localStorageScopeAttribute/u);
  assert.doesNotMatch(panel, /localStorage\.length|localStorage\.key\s*\(/u);
  assert.doesNotMatch(panel, /localUploadDraftStorageKey|cloudImportMarkerStorageKey/u);
});

test("creates and downloads encrypted bytes without direct storage mutation", () => {
  assert.match(panel, /buildLocalBackupPayload/u);
  assert.match(panel, /encryptLocalBackup/u);
  assert.match(panel, /triggerBrowserDownload/u);
  assert.match(panel, /localBackupMimeType/u);
  assert.match(panel, /downloadBytes\?\.fill\(0\)/u);
  assert.match(panel, /setCreatePassphrase\(""\)/u);
  assert.match(panel, /setCreateConfirmation\(""\)/u);
  assert.doesNotMatch(panel, /safeWriteLocalStorage|safeRemoveLocalStorage/u);
});

test("keeps zero-write inspection separate from confirmed restore", () => {
  assert.match(panel, /accept="\.spbackup"/u);
  assert.match(panel, /validateLocalBackupFileName/u);
  assert.match(panel, /validateLocalBackupFileSize/u);
  assert.match(panel, /file\.arrayBuffer\(\)/u);
  assert.match(panel, /parseLocalBackupFile/u);
  assert.match(panel, /decryptLocalBackup/u);
  assert.match(panel, /restoreLocalBackup/u);
  assert.match(panel, /candidate && confirmed/u);
  assert.match(panel, /我了解恢复会替换当前账号的本地数据/u);
  assert.match(panel, /setCandidate\(null\)/u);
  assert.match(panel, /setConfirmed\(false\)/u);
  assert.match(panel, /fileBytes\?\.fill\(0\)/u);
});

test("clears the native file input after restore completion or cancellation", () => {
  assert.match(panel, /fileInputRef/u);
  assert.match(panel, /fileInputRef\.current\.value = ""/u);
});

test("renders accessible inline controls, statuses, and a content-free preview", () => {
  assert.match(panel, /aria-labelledby="local-backup-heading"/u);
  assert.equal((panel.match(/type="password"/gu) ?? []).length, 3);
  assert.match(panel, /aria-describedby=/u);
  assert.match(panel, /role=\{[^}]*error[^}]*\? "alert" : "status"\}/u);
  assert.match(panel, /正在加密/u);
  assert.match(panel, /正在检查/u);
  assert.match(panel, /正在恢复/u);
  assert.match(panel, /本地原书/u);
  assert.match(panel, /阅读器收藏/u);
  assert.doesNotMatch(panel, />[^<]*(?:Provider|token|API|PBKDF2|AES|审计|Secret)[^<]*</u);
});

test("uses the existing restrained product vocabulary and responsive layout", () => {
  assert.match(panel, /rounded-lg border border-\[var\(--border\)\] bg-\[var\(--surface\)\]/u);
  assert.match(panel, /lg:grid-cols-2/u);
  assert.doesNotMatch(panel, /fixed inset-0|role="dialog"|backdrop-blur|rounded-\[3[2-9]px\]|shadow-2xl/u);
  assert.doesNotMatch(panel, /fetch\(|XMLHttpRequest|WebSocket/u);
});
