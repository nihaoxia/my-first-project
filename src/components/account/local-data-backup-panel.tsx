"use client";

import { Download, FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  triggerBrowserDownload,
  type TextDownloadLink,
  type TextDownloadRuntime,
} from "@/lib/export/browser-download";
import {
  buildLocalBackupPayload,
  localBackupMimeType,
  localBackupStorageEntries,
  parseLocalBackupFile,
  validateLocalBackupFileName,
  validateLocalBackupFileSize,
  type LocalBackupDataErrorCode,
  type LocalBackupRawValues,
  type ParsedLocalBackupEnvelope,
} from "@/lib/backup/local-backup-core";
import {
  decryptLocalBackup,
  encryptLocalBackup,
  type LocalBackupEncryptionResult,
  type LocalBackupRestoreCandidate,
} from "@/lib/backup/local-backup-crypto";
import {
  allLocalBackupRestoreGroups,
  restoreLocalBackup,
} from "@/lib/backup/local-backup-restore";
import {
  buildScopedLocalStorageKey,
  localStorageScopeAttribute,
} from "@/lib/storage/local-storage-scope";
import {
  safeReadLocalStorage,
  type LocalStorageAdapter,
} from "@/lib/storage/safe-local-storage";

type Notice = { message: string; error: boolean };

export function LocalDataBackupPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createPassphrase, setCreatePassphrase] = useState("");
  const [createConfirmation, setCreateConfirmation] = useState("");
  const [creating, setCreating] = useState(false);
  const [createNotice, setCreateNotice] = useState<Notice | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [candidate, setCandidate] = useState<LocalBackupRestoreCandidate | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<Notice | null>(null);

  function invalidateRestoreCandidate() {
    setCandidate(null);
    setConfirmed(false);
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCreateBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    setCreating(true);
    setCreateNotice(null);
    let downloadBytes: Uint8Array | undefined;

    try {
      const scope = readCurrentScopeFingerprint();
      if (!scope) {
        setCreateNotice({ message: scopeUnavailableMessage, error: true });
        return;
      }

      const rawValues = readFixedLocalBackupValues(scope);
      if (!rawValues.ok) {
        setCreateNotice({ message: storageUnavailableMessage, error: true });
        return;
      }

      const payload = buildLocalBackupPayload(rawValues.values);
      if (!payload.ok) {
        setCreateNotice({ message: getMalformedDataMessage(payload.code), error: true });
        return;
      }

      const encrypted = await encryptLocalBackup({
        payload: payload.payload,
        passphrase: createPassphrase,
        confirmation: createConfirmation,
        sourceScopeFingerprint: scope,
        now: new Date(),
      });
      if (!encrypted.ok) {
        setCreateNotice({ message: getCreateErrorMessage(encrypted.code), error: true });
        return;
      }

      downloadBytes = encrypted.bytes;
      const download = triggerBrowserDownload(
        {
          fileName: encrypted.fileName,
          data: downloadBytes,
          mimeType: localBackupMimeType,
        },
        createBackupDownloadRuntime(),
      );
      setCreateNotice(
        download.ok
          ? { message: `已准备下载 ${encrypted.fileName}。请妥善保存文件和独立口令。`, error: false }
          : { message: "无法准备备份文件下载，请重试。", error: true },
      );
    } catch {
      setCreateNotice({ message: "无法创建本地数据备份，请重试。", error: true });
    } finally {
      setCreatePassphrase("");
      setCreateConfirmation("");
      downloadBytes?.fill(0);
      setCreating(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setRestorePassphrase("");
    setRestoreNotice(null);
    invalidateRestoreCandidate();
  }

  async function handleInspectBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inspecting) return;

    setInspecting(true);
    setRestoreNotice(null);
    invalidateRestoreCandidate();
    let fileBytes: Uint8Array | undefined;
    let parsedEnvelope: ParsedLocalBackupEnvelope | undefined;

    try {
      const file = selectedFile;
      if (!file) {
        setRestoreNotice({ message: "请先选择一个 Stray Pages 备份文件。", error: true });
        return;
      }

      const fileName = validateLocalBackupFileName(file.name);
      if (!fileName.ok) {
        setRestoreNotice({ message: getInspectErrorMessage(fileName.code), error: true });
        return;
      }

      const fileSize = validateLocalBackupFileSize(file.size);
      if (!fileSize.ok) {
        setRestoreNotice({ message: getInspectErrorMessage(fileSize.code), error: true });
        return;
      }

      fileBytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseLocalBackupFile({
        fileName: file.name,
        fileSize: file.size,
        bytes: fileBytes,
      });
      if (!parsed.ok) {
        setRestoreNotice({ message: getInspectErrorMessage(parsed.code), error: true });
        return;
      }
      parsedEnvelope = parsed.envelope;

      const scope = readCurrentScopeFingerprint();
      if (!scope) {
        setRestoreNotice({ message: scopeUnavailableMessage, error: true });
        return;
      }

      const decrypted = await decryptLocalBackup({
        envelope: parsed.envelope,
        passphrase: restorePassphrase,
        currentScopeFingerprint: scope,
      });
      if (!decrypted.ok) {
        setRestoreNotice({ message: getInspectErrorMessage(decrypted.code), error: true });
        return;
      }

      setCandidate(decrypted.candidate);
      setRestoreNotice({
        message: "备份检查通过。确认下方数量无误后，可以选择恢复。",
        error: false,
      });
    } catch {
      setRestoreNotice({ message: "无法检查备份文件，请重试。", error: true });
    } finally {
      setRestorePassphrase("");
      fileBytes?.fill(0);
      parsedEnvelope?.salt.fill(0);
      parsedEnvelope?.iv.fill(0);
      parsedEnvelope?.ciphertext.fill(0);
      setInspecting(false);
    }
  }

  function handleRestore() {
    if (!(candidate && confirmed) || restoring) return;

    setRestoring(true);
    setRestoreNotice(null);

    try {
      const scope = readCurrentScopeFingerprint();
      if (!scope) {
        setRestoreNotice({ message: scopeUnavailableMessage, error: true });
        return;
      }

      const storage = readBrowserLocalStorage();
      if (!storage.ok) {
        setRestoreNotice({ message: "无法读取当前账号的本地数据，未开始恢复。", error: true });
        return;
      }

      const result = restoreLocalBackup({
        storage: storage.storage,
        payload: candidate.payload,
        selectedGroups: allLocalBackupRestoreGroups,
        sourceScopeFingerprint: candidate.sourceScopeFingerprint,
        inspectedScopeFingerprint: candidate.inspectedScopeFingerprint,
        currentScopeFingerprint: scope,
      });

      if (result.ok) {
        setRestoreNotice({
          message: "本地数据已恢复。请刷新页面，让所有工作区重新读取数据。",
          error: false,
        });
        return;
      }

      if (result.code === "SCOPE_MISMATCH") {
        setRestoreNotice({ message: "此备份来自另一个账号，当前账号不能恢复。", error: true });
      } else if (result.code === "READ_FAILED") {
        setRestoreNotice({ message: "无法读取当前账号的本地数据，未开始恢复。", error: true });
      } else if (result.code === "WRITE_FAILED" && result.rollback === "complete") {
        setRestoreNotice({
          message: "恢复失败，原有本地数据已恢复，未完成替换。",
          error: true,
        });
      } else {
        setRestoreNotice({
          message: "恢复失败，且无法完整还原原有本地数据。请不要继续编辑，并保留备份文件。",
          error: true,
        });
      }
    } catch {
      setRestoreNotice({ message: "无法读取当前账号的本地数据，未开始恢复。", error: true });
    } finally {
      invalidateRestoreCandidate();
      clearSelectedFile();
      setRestoring(false);
    }
  }

  function handleCancelRestore() {
    clearSelectedFile();
    setRestorePassphrase("");
    setRestoreNotice(null);
    invalidateRestoreCandidate();
  }

  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 md:p-6"
      aria-labelledby="local-backup-heading"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-[var(--surface-2)] p-2 text-[var(--primary)]">
          <ShieldCheck aria-hidden="true" size={19} />
        </span>
        <div>
          <h2 id="local-backup-heading" className="text-xl font-semibold">
            本地数据备份
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
            备份只在当前浏览器中加密，不会上传。恢复会替换当前账号的本地数据。
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-10">
        <div>
          <div className="flex items-center gap-2">
            <Download aria-hidden="true" size={17} className="text-[var(--primary)]" />
            <h3 className="font-semibold">创建备份</h3>
          </div>
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-[var(--muted-foreground)]">
            包含本地原书、译本、词汇、句子、笔记和阅读器收藏。请使用独立口令，不要复用账号密码。
          </p>

          <form className="mt-5 space-y-4" onSubmit={handleCreateBackup}>
            <label className="block" htmlFor="local-backup-passphrase">
              <span className="text-sm font-medium">备份口令</span>
              <input
                id="local-backup-passphrase"
                type="password"
                autoComplete="new-password"
                required
                value={createPassphrase}
                onChange={(event) => setCreatePassphrase(event.target.value)}
                aria-describedby="local-backup-passphrase-help"
                className={inputClasses}
              />
            </label>
            <label className="block" htmlFor="local-backup-confirmation">
              <span className="text-sm font-medium">再次输入</span>
              <input
                id="local-backup-confirmation"
                type="password"
                autoComplete="new-password"
                required
                value={createConfirmation}
                onChange={(event) => setCreateConfirmation(event.target.value)}
                aria-describedby="local-backup-passphrase-help"
                className={inputClasses}
              />
            </label>
            <p id="local-backup-passphrase-help" className="text-xs leading-5 text-[var(--muted-foreground)]">
              口令需为 12–128 个字符。忘记口令后无法恢复备份。
            </p>
            <Button type="submit" disabled={creating}>
              <LockKeyhole aria-hidden="true" size={16} />
              {creating ? "正在加密" : "创建并下载备份"}
            </Button>
          </form>

          {createNotice ? <NoticeText notice={createNotice} /> : null}
        </div>

        <div className="lg:border-l lg:border-[var(--border)] lg:pl-10">
          <div className="flex items-center gap-2">
            <FileCheck2 aria-hidden="true" size={17} className="text-[var(--primary)]" />
            <h3 className="font-semibold">恢复备份</h3>
          </div>
          <p className="mt-2 max-w-[68ch] text-sm leading-6 text-[var(--muted-foreground)]">
            先检查文件和数量，检查过程不会修改当前数据。不同账号之间不能恢复。
          </p>

          <form className="mt-5 space-y-4" onSubmit={handleInspectBackup}>
            <label className="block" htmlFor="local-backup-file">
              <span className="text-sm font-medium">备份文件</span>
              <input
                id="local-backup-file"
                ref={fileInputRef}
                type="file"
                accept=".spbackup"
                onChange={handleFileChange}
                className={`${inputClasses} file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-sm file:font-medium`}
              />
            </label>
            <label className="block" htmlFor="local-restore-passphrase">
              <span className="text-sm font-medium">备份口令</span>
              <input
                id="local-restore-passphrase"
                type="password"
                autoComplete="new-password"
                required
                value={restorePassphrase}
                onChange={(event) => setRestorePassphrase(event.target.value)}
                aria-describedby="local-restore-passphrase-help"
                className={inputClasses}
              />
            </label>
            <p id="local-restore-passphrase-help" className="text-xs leading-5 text-[var(--muted-foreground)]">
              口令只用于当前浏览器中的检查，不会保存或上传。
            </p>
            <Button type="submit" variant="secondary" disabled={inspecting || !selectedFile}>
              <FileCheck2 aria-hidden="true" size={16} />
              {inspecting ? "正在检查" : "检查备份"}
            </Button>
          </form>

          {restoreNotice ? <NoticeText notice={restoreNotice} important={restoreNotice.error} /> : null}

          {candidate ? (
            <div className="mt-5 border-t border-[var(--border)] pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-semibold">备份内容</h4>
                <p className="text-xs text-[var(--muted-foreground)]">
                  创建于 {formatBackupTime(candidate.createdAt)}
                </p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-3">
                <PreviewCount label="本地原书" value={candidate.preview.libraryBooks} />
                <PreviewCount label="本地译本" value={candidate.preview.translations} />
                <PreviewCount label="词汇" value={candidate.preview.vocabulary} />
                <PreviewCount label="句子" value={candidate.preview.sentences} />
                <PreviewCount label="笔记" value={candidate.preview.notes} />
                <PreviewCount label="阅读器收藏" value={candidate.preview.readerSelections} />
              </dl>
              <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
                阅读器收藏包括 {candidate.preview.readerSelectionVocabulary} 项词汇和 {candidate.preview.readerSelectionSentences} 项句子。
              </p>

              <label className="mt-5 flex items-start gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[var(--primary)]"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>我了解恢复会替换当前账号的本地数据</span>
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" disabled={!(candidate && confirmed) || restoring} onClick={handleRestore}>
                  <ShieldCheck aria-hidden="true" size={16} />
                  {restoring ? "正在恢复" : "恢复并替换"}
                </Button>
                <Button type="button" variant="ghost" disabled={restoring} onClick={handleCancelRestore}>
                  取消
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function NoticeText({ notice, important = false }: { notice: Notice; important?: boolean }) {
  return (
    <p
      className={`mt-4 text-sm leading-6 ${notice.error ? "font-medium text-[var(--danger)]" : "text-[var(--muted-foreground)]"} ${important ? "max-w-2xl" : ""}`}
      role={notice.error ? "alert" : "status"}
    >
      {notice.message}
    </p>
  );
}

function PreviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function readCurrentScopeFingerprint() {
  return (
    document
      .querySelector<HTMLElement>(`[${localStorageScopeAttribute}]`)
      ?.getAttribute(localStorageScopeAttribute)
      ?.trim() || null
  );
}

function readBrowserLocalStorage():
  | { ok: true; storage: LocalStorageAdapter }
  | { ok: false } {
  try {
    return { ok: true, storage: window.localStorage };
  } catch {
    return { ok: false };
  }
}

function readFixedLocalBackupValues(scope: string):
  | { ok: true; values: LocalBackupRawValues }
  | { ok: false } {
  const browserStorage = readBrowserLocalStorage();
  if (!browserStorage.ok) return browserStorage;

  const values = {} as LocalBackupRawValues;
  for (const { dataKey, baseKey } of localBackupStorageEntries) {
    const result = safeReadLocalStorage(
      browserStorage.storage,
      buildScopedLocalStorageKey(baseKey, scope),
    );
    if (!result.ok) return { ok: false };
    values[dataKey] = result.value;
  }
  return { ok: true, values };
}

function createBackupDownloadRuntime(): TextDownloadRuntime {
  return {
    createBlob(content, mimeType) {
      return new Blob([content as BlobPart], { type: mimeType });
    },
    createObjectUrl(blob) {
      return URL.createObjectURL(blob as Blob);
    },
    revokeObjectUrl(url) {
      URL.revokeObjectURL(url);
    },
    createLink() {
      return document.createElement("a");
    },
    appendLink(link) {
      document.body.append(link as HTMLAnchorElement & TextDownloadLink);
    },
  };
}

function getMalformedDataMessage(code: LocalBackupDataErrorCode) {
  const messages: Record<LocalBackupDataErrorCode, string> = {
    LIBRARY_BOOKS_MALFORMED: "本地原书数据已损坏，无法创建备份。",
    TRANSLATIONS_MALFORMED: "本地译本数据已损坏，无法创建备份。",
    VOCABULARY_MALFORMED: "词汇本数据已损坏，无法创建备份。",
    SENTENCES_MALFORMED: "句子本数据已损坏，无法创建备份。",
    NOTES_MALFORMED: "笔记数据已损坏，无法创建备份。",
    READER_SELECTIONS_MALFORMED: "阅读器收藏数据已损坏，无法创建备份。",
    DUPLICATE_ID: "本地数据包含重复记录，无法创建备份。",
    MISSING_ORIGINAL_BOOK: "本地译本缺少对应原书，无法创建备份。",
  };
  return messages[code];
}

function getCreateErrorMessage(
  code: Extract<LocalBackupEncryptionResult, { ok: false }>["code"],
) {
  switch (code) {
    case "PASSPHRASE_TOO_SHORT":
      return "备份口令至少需要 12 个字符。";
    case "PASSPHRASE_TOO_LONG":
      return "备份口令不能超过 128 个字符。";
    case "PASSPHRASE_MISMATCH":
      return "两次输入的备份口令不一致。";
    case "PASSPHRASE_INVALID_UNICODE":
      return "备份口令包含无效字符，请重新输入。";
    case "CRYPTO_UNAVAILABLE":
      return "当前浏览器无法使用本地加密，请更换受支持的浏览器后重试。";
    default:
      return "当前本地数据过大，未生成备份文件。";
  }
}

function getInspectErrorMessage(code: string) {
  switch (code) {
    case "INVALID_EXTENSION":
      return "请选择 Stray Pages 备份文件（.spbackup）。";
    case "FILE_TOO_LARGE":
      return "备份文件超过 16 MiB，无法检查。";
    case "UNSUPPORTED_VERSION":
      return "此备份版本当前无法恢复。";
    case "SCOPE_MISMATCH":
      return "此备份来自另一个账号，当前账号不能恢复。";
    case "INVALID_DATA":
      return "备份中的本地数据不完整或已损坏，未写入任何内容。";
    case "CRYPTO_UNAVAILABLE":
      return "当前浏览器无法使用本地加密，请更换受支持的浏览器后重试。";
    default:
      return "无法验证备份：口令错误或文件已损坏。";
  }
}

function formatBackupTime(createdAt: string) {
  return new Date(createdAt).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const inputClasses =
  "mt-2 block h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] outline-none transition-colors file:h-7 focus:border-[var(--primary)] focus:outline-[3px] focus:outline-offset-1 focus:outline-[var(--primary)] disabled:opacity-50";
const scopeUnavailableMessage = "当前登录状态无法确定本地数据归属，请重新登录后再试。";
const storageUnavailableMessage = "浏览器已禁用或无法访问本地存储，无法创建备份。";
