# Stray Pages EdgeOne Makers 零费用生产运行手册

本文是 Stray Pages 当前唯一允许的生产部署入口。目标是只使用 EdgeOne Makers 免费项目、平台免费域名、Makers Functions、一个 Blob Store，以及在免费政策被明确确认后才可选择启用的 Makers Models。任何费用状态不明确时一律 fail closed：停止创建资源、停止部署变更、停止 Blob 写入和模型调用，但保留本地代码与已有数据读取能力。

## 1. 不可突破的费用边界

禁止购买、试用、开通、续费或按量使用以下资源：CVM、轻量应用服务器、TCR 企业实例、COS 生产存储、腾讯云短信、收费数据库、CloudBase 收费套餐、收费域名、收费模型、优惠券抵扣资源、首月 0 元资源和任何自动续费资源。不得把试用额度、代金券或临时促销当成永久免费。

平台公开文档是费用判断的唯一依据，操作前必须重新只读核对：

- [价格与套餐](https://pages.edgeone.ai/zh/document/pricing-and-plans)
- [限制与配额](https://pages.edgeone.ai/zh/document/limits-and-quotas)
- [EdgeOne Pages / Makers](https://edgeone.ai/zh/products/pages)
- [Makers Models](https://pages.edgeone.ai/zh/document/models)
- [edgeone.json](https://pages.edgeone.ai/zh/document/edgeone-json)

只有页面当时明确显示所用套餐为 0 元、无需绑定或选择付费方式、不会自动超额计费，才允许继续。任意一项无法确认、文案互相冲突或需要申请提额时，记录“免费状态无法确认”，立即停止。不要自行提交提额工单，不要选择商业版，也不要让平台自动切换套餐。

截至本架构锁定时，应用只接受以下公开免费上限：Blob 1 GB、内置模型 500,000 Token/月。应用主动缩小边界，Blob 硬上限为项目全局 999 MiB，每个上传按完整 2 MiB 预留；模型硬上限为项目全局 450,000 Token/月。Blob 与模型额度都不是“每个用户一份”。KV 不是权威存储，当前不需要时不要创建。

## 2. 本地门禁

在任何控制台或 CLI 写操作之前运行：

```powershell
pnpm install --frozen-lockfile
node --experimental-strip-types --test tests/edgeone-deployment-contract.test.ts tests/edgeone-smoke.test.ts tests/zero-cost-production-contract.test.ts
pnpm verify:zero-cost
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

任何命令非零退出都必须先修复，不能通过启用旧 Prisma、Supabase、COS、短信或 MCP Provider 绕过。验证脚本只输出稳定状态码，不读取或打印环境变量值。

## 3. 创建项目之前的核费检查

1. 退出所有购买、升级、试用、代金券和支付页面，只打开官方价格与配额文档。
2. 确认当前登录账号没有待支付订单、自动续费或可能被新项目复用的付费套餐。
3. 确认新建 Makers 项目的最终确认页显示 0 元，且没有信用卡、微信支付、余额授权或自动超额计费要求。
4. 若页面没有明确说明“无需付费方式”或“不会自动超额计费”，不要点击创建；保留本地完成状态并等待政策变得可核实。
5. 不创建 KV。只有代码实际启用了最长陈旧 60 秒、可随时丢弃重建的列表缓存，才另行核费并创建。

## 4. 唯一生产配置

平台实际读取的部署契约位于仓库根目录 `edgeone.json`；`deploy/edgeone/edgeone.json` 是由测试强制保持逐字节一致的审计副本。它固定使用 Node.js 22、`pnpm install --frozen-lockfile`、`pnpm build`、广州 Makers Functions，以及官方允许范围内的 120 秒函数上限。它不包含定时任务，避免后台函数意外消耗额度。官方文档明确要求 `edgeone.json` 位于项目根目录，不能把 Makers 项目根目录改为 `deploy/edgeone`。

环境变量键以 `deploy/edgeone/env.example` 为准：

```dotenv
AUTH_MODE=edgeone
CLOUD_DATA_PROVIDER=edgeone
CLOUD_STORAGE_PROVIDER=edgeone
EDGEONE_BLOB_STORE=
EDGEONE_SESSION_SECRET=
EDGEONE_FREE_BLOB_CONFIRMED=false
EDGEONE_FREE_MODEL_CONFIRMED=false
MAKERS_MODELS_KEY=
EDGEONE_PRODUCTION_ORIGIN=
```

生产环境不得出现 `DATABASE_URL`、Supabase Service Role、COS、Tencent Cloud、短信、Translation MCP、`AI_*` 等旧键。它们即使仍存在于历史开发代码中，也不能录入 EdgeOne 项目。

## 5. Blob 和 Secret

在核费门禁通过后，只创建一个 Blob Store，并把名称写入平台的 `EDGEONE_BLOB_STORE`。首次部署仍保持 `EDGEONE_FREE_BLOB_CONFIRMED=false`，此时所有强一致读取和列表可用，但账号、Session、业务 Revision、对象及用量事件的创建/删除都会在接触 SDK 前统一返回 `BLOB_WRITE_DISABLED`。只有确认项目、Blob 和超额行为仍为零费用后，才把该值精确改为 `true`；政策变得不明确时立即改回 `false` 并重新部署，从运行时停止全部写入而不关闭读取。

Blob 是账号、Session、书籍、学习数据、导入、翻译 Revision、对象和用量事件的唯一权威存储。不要用 KV 保存认证、授权、所有权、额度、当前 Revision 或单资源裁决。

`EDGEONE_SESSION_SECRET` 必须是新的高熵随机值，至少 64 个字符，只能在本机安全生成后直接粘贴到 EdgeOne Secret 设置。不要把值写入仓库、终端历史、聊天、截图、CI 日志或验收记录。`MAKERS_MODELS_KEY` 采用相同处理规则。

对象写入按以下边界验收：

- 单次上传最大 2 MiB，预留时按完整 2 MiB 计算；
- 项目 Blob 已提交量加预留量达到 999 MiB 前就拒绝新写入；
- 账本缺失、不一致或不可读时返回稳定额度错误，不尝试“先上传再补账”；
- 删除对象只追加不可变用量事件，不能依赖最终一致缓存裁决当前额度；
- 不向现有 COS Bucket 写入任何测试对象。

## 6. 免费模型默认关闭

初次部署保持：

```dotenv
EDGEONE_FREE_MODEL_CONFIRMED=false
MAKERS_MODELS_KEY=
```

此状态下应用必须产生零次模型网络调用，其他账号、上传、阅读和手动导入功能仍可用。只有重新核对官方文档明确显示内置模型为免费 500,000 Token/月、不会自动转收费，并确认 API Key 创建页面为 0 元且不要求付费方式后，才可创建 Key、录入 Secret，并把 `EDGEONE_FREE_MODEL_CONFIRMED` 精确改为 `true`。

应用只允许固定网关 `https://ai-gateway.edgeone.link/v1/chat/completions` 和固定内置模型 `@makers/deepseek-v4-flash`。全项目达到 450,000 Token/月、账本不可用或免费状态无法确认时必须停止调用；不得切换到自带账单的 API Key、MCP、混元或其他收费 Provider。

## 7. 部署

可以使用 EdgeOne 控制台的 Git 仓库导入、官方 CLI 或直接上传，但项目根目录必须是仓库根目录，并确认平台读取根目录 `edgeone.json`。不要把控制台手工配置当成经过 CI 验证的替代品，也不要复制旧 Tencent Cloud 部署参数。部署只允许平台提供的免费 HTTPS 域名，不购买自定义域名。

部署前记录当前完整 Git SHA，部署后只记录项目代号、Git SHA、免费域名和时间，不记录任何 Secret。若平台在确认步骤出现价格、付费方式、升级、试用、自动续费或提额提示，立即取消。

## 8. 无写入 Smoke

把平台返回的完整免费 HTTPS Origin 只放入当前 PowerShell 进程，然后执行：

```powershell
$env:EDGEONE_PRODUCTION_ORIGIN = Read-Host '输入 EdgeOne 返回的完整免费 HTTPS Origin'
pnpm smoke:edgeone
Remove-Item Env:EDGEONE_PRODUCTION_ORIGIN
```

Smoke 只接受平台免费 `*.edgeone.app` HTTPS Origin，并只访问 `/`、`/api/health` 和未认证的 `/api/cloud/books`。它拒绝任意其他域名、IP 地址、带用户名密码的 URL、路径型 Origin、重定向、超大响应和不精确的健康响应；不打印响应正文。这个域名白名单同时阻止任意域名通过 DNS 指向内网来触发 SSRF。预期结果是主页 200、健康接口 200 且只含 `web/auth/blob/quota`、私有 API 401。Smoke 不注册账号、不写 Blob、不调用模型。

## 9. 首次功能验收

只在费用状态再次确认仍为 0 后，使用两个专用测试账号完成最小写入验收：

1. 分别注册、登录、退出和重新登录，恢复码只由账号持有人临时保存；
2. A 创建书籍后，B 的书籍、学习记录、翻译和对象列表均不可见；
3. 分别验证 TXT 上传、签名下载和删除，上传内容不得包含个人或敏感数据；
4. 制造一次同一 Revision 的并发分支，确认系统报告冲突而不是按时间静默覆盖；
5. 验证 Blob 999 MiB 和模型 450,000 Token 的应用硬停止逻辑使用自动测试或注入账本，不得为触顶而真实消耗平台额度；
6. 免费模型未启用时确认翻译给出可操作的“本地翻译或手动导入”提示且零外部调用；
7. 只读查看平台用量和费用页，确认没有订单、没有付费资源、费用为 0。

真实测试对象验证完立即从应用删除。删除是业务 Revision/事件，不代表平台计费统计会立即下降；继续以 999 MiB 应用账本为准，不通过删除来绕过硬上限。

## 10. 回滚、导出和恢复

应用回滚只切回上一条已验证 Git SHA，不删除 Blob、不重写 Revision、不清零额度账本。回滚后重新运行无写入 Smoke。

在删除项目、Blob Store 或更换账号前，必须先使用 EdgeOne 官方只读 Blob 接口做完整导出，并验证对象数量、键列表、内容哈希和至少一次隔离恢复。仓库当前没有“一键删除云数据”命令；不得把删除当成导出。任何导出工具都必须保持强一致读取、响应大小限制、秘密脱敏和零收费门禁。

若历史 COS Bucket 为空且今后需要删除，必须由账号持有人在单独任务中再次确认 Bucket 身份、费用状态和删除影响。本手册不授权写入 COS，也不授权删除任何既有腾讯云资源。

## 11. 政策变化和事故处理

官方免费政策、额度、商业版状态或计费方式发生变化时：

1. 立即把 `EDGEONE_FREE_BLOB_CONFIRMED` 和 `EDGEONE_FREE_MODEL_CONFIRMED` 都改回 `false` 并部署只读版本；
2. 停止新部署和所有 Blob 写入，保留只读访问；
3. 不申请提额、不绑定付款、不临时切换收费 Provider；
4. 导出并校验权威 Blob 数据；
5. 在新的零费用方案经过代码门禁和只读核费后再恢复写入。

Secret 疑似泄漏时立即撤销并轮换，但不要在工单、提交、聊天或日志中复制旧值。最终验收记录只允许包含命令、退出码、Git SHA、匿名项目代号、免费状态和费用 0 的结论。
