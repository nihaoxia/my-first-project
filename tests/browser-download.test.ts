import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTextDownloadNotice,
  getTextDownloadMimeType,
  triggerTextDownload,
  type TextDownloadRuntime,
} from "../src/lib/export/browser-download.ts";

function runtime(events: string[], failClick = false): TextDownloadRuntime {
  return {
    createBlob(content, mimeType) {
      events.push(`blob:${mimeType}:${content}`);
      return { content, mimeType };
    },
    createObjectUrl() {
      events.push("url:create");
      return "blob:test";
    },
    revokeObjectUrl(url) {
      events.push(`url:revoke:${url}`);
    },
    createLink() {
      events.push("link:create");
      return {
        href: "",
        download: "",
        click() {
          events.push("link:click");
          if (failClick) throw new Error("blocked");
        },
        remove() {
          events.push("link:remove");
        },
      };
    },
    appendLink(link) {
      events.push(`link:append:${link.download}:${link.href}`);
    },
  };
}

test("downloads UTF-8 text and always releases the object URL", () => {
  const events: string[] = [];
  const result = triggerTextDownload(
    { fileName: "book.txt", content: "正文", kind: "text" },
    runtime(events),
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(events, [
    "blob:text/plain;charset=utf-8:正文",
    "url:create",
    "link:create",
    "link:append:book.txt:blob:test",
    "link:click",
    "link:remove",
    "url:revoke:blob:test",
  ]);
});

test("rejects path-like file names before touching the browser runtime", () => {
  const events: string[] = [];

  assert.deepEqual(
    triggerTextDownload(
      { fileName: "../book.txt", content: "x", kind: "text" },
      runtime(events),
    ),
    { ok: false, code: "INVALID_FILE_NAME" },
  );
  assert.deepEqual(events, []);
});

test("reports a blocked download and still removes temporary resources", () => {
  const events: string[] = [];

  assert.deepEqual(
    triggerTextDownload(
      { fileName: "notes.md", content: "# Notes", kind: "markdown" },
      runtime(events, true),
    ),
    { ok: false, code: "DOWNLOAD_FAILED" },
  );
  assert.deepEqual(events.slice(-2), ["link:remove", "url:revoke:blob:test"]);
});

test("cleanup failures never escape as an unhandled download error", () => {
  const events: string[] = [];
  const port = runtime(events);
  port.revokeObjectUrl = () => {
    throw new Error("cleanup blocked");
  };

  assert.deepEqual(
    triggerTextDownload(
      { fileName: "notes.md", content: "# Notes", kind: "markdown" },
      port,
    ),
    { ok: true },
  );
});

test("returns fixed MIME types and stable user notices", () => {
  assert.equal(getTextDownloadMimeType("text"), "text/plain;charset=utf-8");
  assert.equal(getTextDownloadMimeType("csv"), "text/csv;charset=utf-8");
  assert.equal(getTextDownloadMimeType("markdown"), "text/markdown;charset=utf-8");
  assert.equal(buildTextDownloadNotice({ ok: true }, "book.txt"), "已准备下载 book.txt");
  assert.equal(
    buildTextDownloadNotice({ ok: false, code: "DOWNLOAD_FAILED" }, "book.txt"),
    "无法准备下载，请重试。",
  );
});
