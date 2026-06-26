import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyExportDownloadNotice,
  getStudyExportMimeType,
} from "../src/lib/export/study-download.ts";

test("returns browser download mime types for study exports", () => {
  assert.equal(getStudyExportMimeType("csv"), "text/csv;charset=utf-8");
  assert.equal(getStudyExportMimeType("markdown"), "text/markdown;charset=utf-8");
});

test("builds a user-facing study export download notice", () => {
  assert.equal(
    buildStudyExportDownloadNotice("demo-vocabulary.csv"),
    "已准备下载 demo-vocabulary.csv",
  );
});
