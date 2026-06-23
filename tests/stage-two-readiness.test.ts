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
    ],
  );
});

test("keeps external Supabase and SMS integration as explicit blockers", () => {
  const readiness = getStageTwoReadiness();

  assert.deepEqual(readiness.externalBlockers, [
    "Supabase 项目 URL、anon key 和 service role key 尚未配置。",
    "PostgreSQL DATABASE_URL / DIRECT_URL 尚未连接到真实项目。",
    "真实短信验证码服务尚未接入，当前仍使用开发期固定验证码 123456。",
    "Prisma 迁移尚未应用到真实远程数据库。",
  ]);
});
