import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminExportSummary } from "../src/lib/admin/admin-export-summary.ts";

test("builds an admin export and operations summary", () => {
  const summary = buildAdminExportSummary({
    userCount: 128,
    balanceRecordCount: 3,
    translationTaskCount: 4,
    failedTaskCount: 2,
    usageLabel: "2.1M tokens",
    exportFiles: [
      { fileName: "the-border-of-mist.txt", format: "TXT" },
      { fileName: "mi-wu-bian-jing-vocabulary.csv", format: "CSV" },
    ],
  });

  assert.equal(summary.exportFileCount, 2);
  assert.deepEqual(summary.recentExportFileNames, [
    "the-border-of-mist.txt",
    "mi-wu-bian-jing-vocabulary.csv",
  ]);
  assert.match(summary.items.map((item) => item.label).join("\n"), /用户/);
  assert.match(summary.items.map((item) => item.label).join("\n"), /失败记录/);
});
