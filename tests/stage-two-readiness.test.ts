import test from "node:test";
import assert from "node:assert/strict";

import {
  getStageTwoReadiness,
  isStageTwoLocallyComplete,
} from "../src/lib/project/stage-two-readiness.ts";

test("marks all local stage two foundations as complete", () => {
  const readiness = getStageTwoReadiness();

  assert.equal(isStageTwoLocallyComplete(readiness), true);
  assert.deepEqual(
    readiness.localItems.map((item) => item.status),
    [
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
    ],
  );
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /Supabase Auth/);
  assert.match(readiness.localItems.map((item) => item.label).join("\n"), /migration.*RLS/i);
});

test("keeps only deployment credentials, remote migration, and SMS provider as external blockers", () => {
  const readiness = getStageTwoReadiness();

  assert.deepEqual(readiness.externalBlockers, [
    "部署环境仍需配置 Supabase 项目 URL、anon key、service role key 和 PostgreSQL DATABASE_URL。",
    "权威 Supabase migration 仍需应用并验证到目标远程项目。",
    "生产手机号 OTP 仍需在目标 Supabase 项目配置短信供应商；固定验证码 123456 仅用于本地 Docker。",
  ]);
});
