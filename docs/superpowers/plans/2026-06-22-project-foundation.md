# Stray Pages 项目基础骨架实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 建立 Stray Pages 第一版网页项目的可运行基础骨架，包括 Next.js、TypeScript、Tailwind、基础页面、文档规则、环境变量示例和基础验证命令。

**架构：** 第一阶段只搭建单体 Next.js 项目骨架，不接数据库、不接 AI、不接后台任务。业务页面先用静态占位数据表达产品结构，保证后续可以按模块增量接入上传、书架、阅读器、后台和翻译队列。

**技术栈：** Next.js、React、TypeScript、Tailwind CSS、lucide-react、ESLint、Git、Markdown 文档。

---

## 范围边界

本计划包含：

- 初始化 Next.js 项目。
- 配置 TypeScript、Tailwind、ESLint。
- 建立基础目录结构。
- 建立产品级视觉基础，包括颜色变量、基础布局、按钮和页面结构。
- 创建首页或应用入口骨架。
- 创建登录、书架、阅读器、后台的路由占位。
- 创建 `.env.example`。
- 更新 `docs/DEV_LOG.md`。
- 本地验证并提交。

本计划不包含：

- 真实手机号登录。
- Supabase 接入。
- Prisma schema。
- 文件上传和 EPUB/TXT 解析。
- AI 翻译。
- 后台任务队列。
- 余额和扣费逻辑。
- GitHub Actions。

这些内容应拆成后续独立计划。

## 文件结构

将创建或修改：

- 创建：`package.json`，项目脚本和依赖声明。
- 创建：`next.config.ts`，Next.js 配置。
- 创建：`tsconfig.json`，TypeScript 配置。
- 创建：`postcss.config.mjs`，Tailwind/PostCSS 配置。
- 创建：`eslint.config.mjs`，ESLint 配置。
- 创建：`src/app/layout.tsx`，全局应用布局。
- 创建：`src/app/page.tsx`，第一屏应用入口。
- 创建：`src/app/login/page.tsx`，登录页占位。
- 创建：`src/app/library/page.tsx`，书架页占位。
- 创建：`src/app/reader/page.tsx`，阅读器页占位。
- 创建：`src/app/admin/page.tsx`，后台页占位。
- 创建：`src/app/globals.css`，全局样式和设计变量。
- 创建：`src/components/app-shell.tsx`，登录后产品壳。
- 创建：`src/components/ui/button.tsx`，基础按钮组件。
- 创建：`src/lib/routes.ts`，核心路由常量。
- 创建：`.env.example`，环境变量示例。
- 修改：`docs/DEV_LOG.md`，记录基础骨架实现结果。

---

## 任务 1：初始化 Next.js 项目依赖

**文件：**

- 创建：`package.json`
- 创建：`next.config.ts`
- 创建：`tsconfig.json`
- 创建：`postcss.config.mjs`
- 创建：`eslint.config.mjs`

- [ ] **步骤 1：确认当前目录没有现有前端项目文件**

运行：

```powershell
Get-ChildItem -Force
```

预期：

```text
.agents
.git
docs
.gitignore
STRAY_PAGES_SPEC.md
```

如果已存在 `package.json`，先阅读它，不要覆盖。

- [ ] **步骤 2：创建 Next.js 项目**

运行：

```powershell
npx create-next-app@latest . --ts --eslint --tailwind --app --src-dir --import-alias "@/*"
```

交互选项如出现，选择：

```text
TypeScript: Yes
ESLint: Yes
Tailwind CSS: Yes
src directory: Yes
App Router: Yes
Turbopack: No
import alias: @/*
```

预期：

```text
Success! Created stray-pages
```

实际项目名可能由当前目录推导，不依赖该输出文本。

- [ ] **步骤 3：安装第一阶段需要的 UI 依赖**

运行：

```powershell
npm install lucide-react clsx tailwind-merge
```

预期：

```text
added ...
found 0 vulnerabilities
```

如果出现非 0 vulnerabilities，记录到 `docs/DEV_LOG.md`，但不在本任务中扩展依赖治理。

- [ ] **步骤 4：运行依赖安装后的基础检查**

运行：

```powershell
npm run lint
```

预期：

```text
No ESLint warnings or errors
```

如果模板生成的 lint 输出格式不同，以退出码 0 为通过标准。

- [ ] **步骤 5：Commit**

运行：

```powershell
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs src
git commit -m "chore: scaffold Next.js app"
```

预期：

```text
[main ...] chore: scaffold Next.js app
```

---

## 任务 2：建立基础设计变量和全局样式

**文件：**

- 修改：`src/app/globals.css`

- [ ] **步骤 1：替换全局样式为 Stray Pages 产品基调**

将 `src/app/globals.css` 设置为：

```css
@import "tailwindcss";

:root {
  --background: oklch(0.985 0.004 250);
  --foreground: oklch(0.19 0.018 255);
  --muted: oklch(0.94 0.007 255);
  --muted-foreground: oklch(0.43 0.018 255);
  --surface: oklch(1 0 0);
  --surface-2: oklch(0.965 0.006 250);
  --border: oklch(0.88 0.01 250);
  --primary: oklch(0.48 0.12 248);
  --primary-foreground: oklch(0.99 0 0);
  --accent: oklch(0.68 0.13 160);
  --danger: oklch(0.58 0.18 25);
  --warning: oklch(0.72 0.14 78);
  --success: oklch(0.58 0.13 150);
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background: var(--background);
}

body {
  min-height: 100%;
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  text-rendering: optimizeLegibility;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
textarea,
select {
  font: inherit;
}

::selection {
  background: color-mix(in oklch, var(--primary) 24%, transparent);
}
```

- [ ] **步骤 2：验证样式文件可编译**

运行：

```powershell
npm run lint
```

预期：退出码 0。

- [ ] **步骤 3：Commit**

运行：

```powershell
git add src/app/globals.css
git commit -m "style: define Stray Pages design tokens"
```

---

## 任务 3：创建基础路由常量和按钮组件

**文件：**

- 创建：`src/lib/routes.ts`
- 创建：`src/components/ui/button.tsx`

- [ ] **步骤 1：创建路由常量**

创建 `src/lib/routes.ts`：

```ts
export const routes = {
  home: "/",
  login: "/login",
  library: "/library",
  reader: "/reader",
  admin: "/admin",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
```

- [ ] **步骤 2：创建基础按钮组件**

创建 `src/components/ui/button.tsx`：

```tsx
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-95 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
  secondary:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
  ghost:
    "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
};

const baseClasses =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50";

type SharedButtonProps = {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
};

type ButtonProps = SharedButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: never;
  };

type LinkButtonProps = SharedButtonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

export function Button(props: ButtonProps | LinkButtonProps) {
  const { children, className, variant = "primary", ...rest } = props;
  const classes = clsx(baseClasses, buttonClasses[variant], className);

  if ("href" in props && props.href) {
    return (
      <Link className={classes} href={props.href}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
```

- [ ] **步骤 3：运行类型和 lint 检查**

运行：

```powershell
npm run lint
```

预期：退出码 0。

- [ ] **步骤 4：Commit**

运行：

```powershell
git add src/lib/routes.ts src/components/ui/button.tsx
git commit -m "feat: add base routes and button component"
```

---

## 任务 4：创建应用壳和核心页面占位

**文件：**

- 修改：`src/app/layout.tsx`
- 修改：`src/app/page.tsx`
- 创建：`src/components/app-shell.tsx`
- 创建：`src/app/login/page.tsx`
- 创建：`src/app/library/page.tsx`
- 创建：`src/app/reader/page.tsx`
- 创建：`src/app/admin/page.tsx`

- [ ] **步骤 1：设置全局布局元信息**

修改 `src/app/layout.tsx`：

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stray Pages",
  description: "Private novel translation and language-learning reader.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **步骤 2：创建应用壳**

创建 `src/components/app-shell.tsx`：

```tsx
import { BookOpen, Library, Settings, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

const navItems = [
  { href: routes.library, label: "书架", icon: Library },
  { href: routes.reader, label: "阅读器", icon: BookOpen },
  { href: routes.admin, label: "后台", icon: ShieldCheck },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <a className="text-base font-semibold" href={routes.home}>
            Stray Pages
          </a>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button key={item.href} href={item.href} variant="ghost">
                  <Icon aria-hidden="true" size={17} />
                  {item.label}
                </Button>
              );
            })}
          </nav>
          <Button href={routes.login} variant="secondary">
            <Settings aria-hidden="true" size={17} />
            登录
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **步骤 3：创建首页**

修改 `src/app/page.tsx`：

```tsx
import { ArrowRight, BookMarked, Languages, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

const highlights = [
  {
    title: "私人书架",
    description: "保存原版小说和多个目标语言译本。",
    icon: BookMarked,
  },
  {
    title: "按章翻译",
    description: "章节进入队列，翻译、质检和扣费分步执行。",
    icon: Languages,
  },
  {
    title: "阅读学习",
    description: "阅读时划词、划句、划段获取解释并收藏。",
    icon: Sparkles,
  },
];

export default function HomePage() {
  return (
    <AppShell>
      <section className="grid min-h-[calc(100vh-8rem)] items-center gap-10 lg:grid-cols-[1fr_420px]">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-medium text-[var(--primary)]">
            小说翻译与语言学习工作台
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-normal text-[var(--foreground)]">
            把你有权处理的小说，变成可阅读、可学习、可导出的译本。
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-foreground)]">
            上传 TXT 或 EPUB，系统自动拆章、分析术语、按章翻译并质检。阅读时可以划词、划句、划段询问 AI。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href={routes.library}>
              进入书架
              <ArrowRight aria-hidden="true" size={18} />
            </Button>
            <Button href={routes.login} variant="secondary">
              手机号登录
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="border-b border-[var(--border)] pb-4">
            <p className="text-sm text-[var(--muted-foreground)]">翻译队列预览</p>
            <h2 className="mt-1 text-xl font-semibold">《示例小说》英文译本</h2>
          </div>
          <div className="mt-5 space-y-4">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--primary)]">
                    <Icon aria-hidden="true" size={19} />
                  </div>
                  <div>
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
```

- [ ] **步骤 4：创建登录页占位**

创建 `src/app/login/page.tsx`：

```tsx
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-2xl font-semibold">手机号登录</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          第一阶段仅保留界面入口，真实验证码会在账号系统阶段接入。
        </p>
        <div className="mt-6 space-y-3">
          <input
            className="h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
            placeholder="手机号"
          />
          <input
            className="h-11 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
            placeholder="验证码"
          />
          <Button className="w-full">继续</Button>
        </div>
      </section>
    </AppShell>
  );
}
```

- [ ] **步骤 5：创建书架页占位**

创建 `src/app/library/page.tsx`：

```tsx
import { Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default function LibraryPage() {
  return (
    <AppShell>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-semibold">私人书架</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            原版书和译本书会在这里分区管理。
          </p>
        </div>
        <Button>
          <Upload aria-hidden="true" size={18} />
          上传小说
        </Button>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">原版书架</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            TXT/EPUB 上传后会先进入这里。
          </p>
        </section>
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="font-semibold">译本书架</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            每个目标语言译本会独立保存。
          </p>
        </section>
      </div>
    </AppShell>
  );
}
```

- [ ] **步骤 6：创建阅读器页占位**

创建 `src/app/reader/page.tsx`：

```tsx
import { AppShell } from "@/components/app-shell";

export default function ReaderPage() {
  return (
    <AppShell>
      <section className="mx-auto max-w-3xl">
        <p className="text-sm text-[var(--muted-foreground)]">译本阅读器</p>
        <h1 className="mt-2 text-3xl font-semibold">第一章：示例章节</h1>
        <article className="mt-8 space-y-5 text-lg leading-9">
          <p>
            阅读器第一阶段只建立页面骨架。后续会接入章节目录、原文/译文切换、双语对照、划词解释和阅读设置。
          </p>
          <p>
            这里会重点优化电脑端阅读体验，确保长文本可读、界面安静、工具栏清晰。
          </p>
        </article>
      </section>
    </AppShell>
  );
}
```

- [ ] **步骤 7：创建后台页占位**

创建 `src/app/admin/page.tsx`：

```tsx
import { AppShell } from "@/components/app-shell";

const metrics = [
  ["用户数量", "0"],
  ["上传书籍", "0"],
  ["翻译任务", "0"],
  ["冻结金额", "0.00"],
];

export default function AdminPage() {
  return (
    <AppShell>
      <h1 className="text-3xl font-semibold">基础后台</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">
        第一阶段只保留入口。后续会接入用户、余额、任务和用量监控。
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {metrics.map(([label, value]) => (
          <section
            key={label}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
          >
            <p className="text-sm text-[var(--muted-foreground)]">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
```

- [ ] **步骤 8：运行检查**

运行：

```powershell
npm run lint
npm run build
```

预期：两个命令退出码均为 0。

- [ ] **步骤 9：Commit**

运行：

```powershell
git add src
git commit -m "feat: add app shell and core page placeholders"
```

---

## 任务 5：添加环境变量示例和文档更新

**文件：**

- 创建：`.env.example`
- 修改：`docs/DEV_LOG.md`
- 修改：`docs/GITHUB_SETUP.md`

- [ ] **步骤 1：创建环境变量示例**

创建 `.env.example`：

```text
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI provider
AI_PROVIDER=
AI_API_KEY=

# Background jobs
TRIGGER_SECRET_KEY=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **步骤 2：更新开发日志**

在 `docs/DEV_LOG.md` 的 `2026-06-22` 下追加：

```markdown
### 项目基础骨架

- 初始化 Next.js、React、TypeScript、Tailwind 项目骨架。
- 建立 Stray Pages 基础视觉变量、应用壳和核心页面占位。
- 创建登录、书架、阅读器、后台入口页面。
- 添加 `.env.example`，记录后续 Supabase、AI 和后台任务所需环境变量。
- 验证方式：运行 `npm run lint` 和 `npm run build`。
```

- [ ] **步骤 3：运行最终验证**

运行：

```powershell
npm run lint
npm run build
git status --short
```

预期：

```text
 M docs/DEV_LOG.md
?? .env.example
```

如果前序任务已提交，状态中只应出现文档和 `.env.example`。

- [ ] **步骤 4：Commit**

运行：

```powershell
git add .env.example docs/DEV_LOG.md docs/GITHUB_SETUP.md
git commit -m "docs: document project foundation setup"
```

---

## 任务 6：本地运行和浏览器验证

**文件：**

- 不创建文件。
- 如发现 UI 问题，修改对应页面或样式文件。

- [ ] **步骤 1：启动开发服务器**

运行：

```powershell
npm run dev
```

预期：

```text
Local: http://localhost:3000
```

- [ ] **步骤 2：浏览器验证核心路由**

打开以下页面：

```text
http://localhost:3000
http://localhost:3000/login
http://localhost:3000/library
http://localhost:3000/reader
http://localhost:3000/admin
```

预期：

- 页面不报错。
- 导航可以点击。
- 文字不互相遮挡。
- 首页在电脑宽度下视觉完整。
- 手机宽度下基础可访问。

- [ ] **步骤 3：如有 UI 问题，做最小修复**

示例：

```powershell
npm run lint
npm run build
```

预期：退出码 0。

- [ ] **步骤 4：Commit**

如果有修复：

```powershell
git add src docs/DEV_LOG.md
git commit -m "fix: polish foundation page layout"
```

如果无修复，不创建空提交。

---

## 任务 7：推送到 GitHub

**文件：**

- 不创建文件。

- [ ] **步骤 1：确认工作区干净**

运行：

```powershell
git status --short
```

预期：无输出。

- [ ] **步骤 2：推送**

运行：

```powershell
git push
```

预期：

```text
Everything up-to-date
```

或：

```text
main -> main
```

---

## 自检

- 规格覆盖度：本计划只覆盖项目基础骨架，未覆盖上传、数据库、AI、翻译队列、余额、阅读学习、导出和后台管理的真实业务逻辑。这些应进入后续计划。
- 占位符扫描：本计划中的页面占位是第一阶段明确范围，不是未定义实现项；每个任务均包含具体文件和验证命令。
- 类型一致性：`routes`、`Button`、`AppShell` 在页面代码中使用的导出名保持一致。

## 执行选项

计划完成后有两种执行方式：

1. **子代理驱动（推荐）**：每个任务调度一个新的子代理，任务间进行审查，快速迭代。
2. **内联执行**：在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点。

对于 Stray Pages 当前阶段，建议使用 **内联执行**。原因是项目还很小，第一阶段主要是搭骨架、验证和提交，不需要并行拆给多个子代理。
