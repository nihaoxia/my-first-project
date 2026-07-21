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
  assert.match(panel, /我了解恢复会替换所选分类的当前本地数据/u);
  assert.match(panel, /setCandidate\(null\)/u);
  assert.match(panel, /setConfirmed\(false\)/u);
  assert.match(panel, /fileBytes\?\.fill\(0\)/u);
});

test("clears the native file input after restore completion or cancellation", () => {
  assert.match(panel, /fileInputRef/u);
  assert.match(panel, /fileInputRef\.current\.value = ""/u);
});

test("defaults every restore group after inspection and passes the explicit selection", () => {
  assert.match(panel, /allLocalBackupRestoreGroups/u);
  assert.match(panel, /selectedRestoreGroups/u);
  assert.match(panel, /setSelectedRestoreGroups\(\[\.\.\.allLocalBackupRestoreGroups\]\)/u);
  assert.match(panel, /selectedGroups:\s*selectedRestoreGroups/u);
});

test("resets confirmation when restore groups change or the candidate is invalidated", () => {
  assert.match(panel, /handleRestoreGroupChange/u);
  assert.match(panel, /setConfirmed\(false\)/u);
  assert.match(panel, /setSelectedRestoreGroups\(\[\]\)/u);
});

test("renders five accessible restore groups and blocks an empty selection", () => {
  assert.match(panel, /<fieldset/u);
  assert.match(panel, /<legend[^>]*>选择恢复内容<\/legend>/u);
  assert.match(panel, /原书与译本/u);
  assert.match(panel, /词汇/u);
  assert.match(panel, /句子/u);
  assert.match(panel, /笔记/u);
  assert.match(panel, /阅读器收藏/u);
  assert.match(panel, /aria-describedby=/u);
  assert.match(panel, /请至少选择一类要恢复的数据/u);
  assert.match(panel, /selectedRestoreGroups\.length === 0/u);
  assert.match(panel, /我了解恢复会替换所选分类的当前本地数据/u);
  assert.match(panel, /恢复所选数据/u);
  assert.match(panel, /getRestoreGroupCountLabel/u);
  assert.match(panel, /preview\.libraryBooks/u);
  assert.match(panel, /preview\.translations/u);
  assert.doesNotMatch(panel, /恢复会替换当前账号的本地数据/u);
});

test("defaults inspected backups to safe merge and stores only an in-memory inspection", () => {
  assert.match(panel, /restoreMode/u);
  assert.match(panel, /useState<LocalBackupRestoreMode>\("merge"\)/u);
  assert.match(panel, /mergeInspection/u);
  assert.match(panel, /useState<LocalBackupMergeInspection \| null>\(null\)/u);
  assert.match(panel, /previewingMerge/u);
  assert.match(panel, /inspectLocalBackupMerge/u);
  assert.doesNotMatch(panel, /localStorage\.setItem[^\n]*(?:restoreMode|mergeInspection)/u);
});

test("invalidates merge preview and confirmation when mode groups or candidate change", () => {
  assert.match(panel, /clearMergeInspection/u);
  assert.match(panel, /setMergeInspection\(null\)/u);
  assert.match(panel, /setConfirmed\(false\)/u);
  assert.match(panel, /handleRestoreModeChange/u);
  assert.match(panel, /handleRestoreGroupChange/u);
});

test("renders accessible restore modes and count-only merge previews", () => {
  assert.match(panel, /<legend[^>]*>恢复方式<\/legend>/u);
  assert.match(panel, /type="radio"/u);
  assert.match(panel, /安全合并（推荐）/u);
  assert.match(panel, /替换所选分类/u);
  assert.match(panel, /预览合并结果/u);
  assert.match(panel, /合并所选数据/u);
  assert.match(panel, /当前记录/u);
  assert.match(panel, /将补回/u);
  assert.match(panel, /冲突保留当前/u);
  assert.match(panel, /重新编号/u);
  assert.doesNotMatch(panel, /targetRawValues\[[^\]]+\]/u);
});

test("uses mode-specific confirmation and preserves candidates after prewrite merge errors", () => {
  assert.match(panel, /安全合并会保留当前记录/u);
  assert.match(panel, /恢复会替换所选分类/u);
  assert.match(panel, /CURRENT_DATA_CHANGED/u);
  assert.match(panel, /请重新预览/u);
  assert.match(panel, /preserveCandidate/u);
  assert.match(panel, /invalidateRestoreCandidate/u);
  assert.match(panel, /clearMergeInspection/u);
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
