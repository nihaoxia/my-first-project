# Security and Core-flow Hardening Implementation Plan

> Execute in small test-first batches. Do not commit or discard pre-existing worktree changes.

**Goal:** Fix confirmed authentication, browser-data isolation, reader-navigation, parsing, validation, accessibility, and configuration defects without representing unavailable external services as complete.

**Architecture:** Keep server authorization decisions in shared pure policy helpers, keep browser persistence behind scoped safe-storage adapters, and keep route construction/parsing in pure functions covered by Node tests. Server components provide only non-sensitive scope and identity values to client components.

**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Prisma, Node test runner.

---

## Task 1: Harden mock authentication and login redirects

**Files:**

- Modify: `src/lib/auth/mock-policy.ts`
- Modify: `src/lib/auth/mock-session.ts`
- Modify: `src/proxy.ts`
- Modify: `src/app/login/actions.ts` if needed
- Test: `tests/auth-mock-policy.test.ts`

1. Add failing cases for literal, encoded, and double-encoded backslashes and for production mock-cookie policy.
2. Run `node --experimental-strip-types --test tests/auth-mock-policy.test.ts` and confirm the expected failures.
3. Add one shared pure enablement policy and a bounded redirect decoder/origin check.
4. Route every mock-cookie read through the policy and secure production cookies.
5. Re-run the focused test and the full auth test subset.

## Task 2: Add account-scoped, failure-aware browser storage

**Files:**

- Create: `src/lib/storage/local-storage-scope.ts`
- Create: `src/lib/storage/safe-local-storage.ts`
- Modify: `src/components/app-shell.tsx` or the actual shell owner
- Modify: `src/lib/upload/local-upload-storage.ts`
- Modify: `src/lib/library/local-library-storage.ts`
- Modify: `src/lib/library/local-translation-storage.ts`
- Modify: their client callers
- Test: create `tests/local-storage-scope.test.ts`
- Test: create `tests/safe-local-storage.test.ts`
- Test: update existing storage suites

1. Add failing tests proving different accounts get different non-plaintext keys and storage exceptions become typed results.
2. Implement deterministic scope derivation, DOM scope lookup, key construction, and safe get/set/remove wrappers.
3. Make the authenticated shell publish the scope.
4. Migrate all local keys and callers without claiming unscoped legacy data.
5. Surface malformed/quota/unavailable states in the current UI and avoid duplicate draft content where possible.
6. Run all storage and component-policy tests.

## Task 3: Make reader chapter controls real and honest

**Files:**

- Modify: `src/lib/routes.ts` or the existing route helper module
- Modify: `src/lib/mock-data.ts`
- Modify: `src/app/reader/page.tsx`
- Modify: `src/components/reader/reader-workspace.tsx`
- Modify: `src/components/reader/local-translation-reader.tsx`
- Test: `tests/routes.test.ts`
- Add/update reader-view tests as appropriate

1. Add failing tests for reader links with translation and chapter IDs and requested-chapter selection.
2. Implement URL construction and dynamic reader-view selection.
3. Render the table of contents and previous/next controls as real links.
4. Pass the local translation identity into links.
5. Disable unimplemented AI/speech actions with accessible explanatory text.
6. Run reader and route tests.

## Task 4: Correct TXT directory parsing and persisted-data validation

**Files:**

- Modify: `src/lib/upload/txt-chapter-parser.ts`
- Modify: `src/lib/library/local-library-storage.ts`
- Modify: `src/lib/library/local-translation-storage.ts`
- Modify: ID creation helpers
- Test: `tests/txt-chapter-parser.test.ts`
- Test: `tests/local-library-storage.test.ts`
- Test: `tests/local-translation-storage.test.ts`

1. Add the complete-directory reproduction and malformed nested-chapter cases as failing tests.
2. Skip directory-only headings until the first repeated real chapter heading.
3. Deep-validate local records and recover from corrupt entries.
4. Add collision-resistant IDs without breaking existing valid records.
5. Run parser/library/translation suites.

## Task 5: Tighten upload limits and text decoding behavior

**Files:**

- Modify: `src/lib/upload/file-policy.ts`
- Modify: upload UI/copy and TXT decode helper
- Test: relevant upload policy/parser/copy tests

1. Add failing tests for the local persistence limit and detectable UTF-8/GB18030 decoding behavior supported by the runtime.
2. Implement explicit local-mode limits and decoding fallback with clear errors for unsupported binary formats.
3. Ensure advertised file types match the flows that can actually continue.
4. Run all upload suites.

## Task 6: Improve form, mobile shell, and runtime configuration

**Files:**

- Modify: `src/app/login/page.tsx`
- Modify: shell/navigation components and styles
- Modify: `package.json`
- Modify: `next.config.ts`
- Modify: `prisma/schema.prisma`
- Test: `tests/user-facing-copy.test.ts` and configuration assertions if present

1. Add testable assertions for labels/input metadata and mobile-accessible navigation where practical.
2. Add semantic form fields and narrow-screen navigation behavior in the existing visual language.
3. Raise the Node engine floor to a version that supports the test runner command.
4. Add non-breaking security response headers and disable `X-Powered-By`.
5. Add `TranslationTask`'s expressible uniqueness constraint; do not invent partial-index migrations.
6. Run focused tests, lint, and typecheck.

## Task 7: Full verification and regression audit

**Files:**

- Review all changed files; restore any generated drift such as `next-env.d.ts` to its pre-build state.

1. Run `node --experimental-strip-types --test tests/*.test.ts`.
2. Run `node node_modules/eslint/bin/eslint.js .`.
3. Run `node node_modules/typescript/bin/tsc --noEmit --incremental false`.
4. Set a placeholder `DATABASE_URL` and run `node node_modules/prisma/build/index.js validate`.
5. Run `node node_modules/next/dist/bin/next build`.
6. Run `git diff --check` and inspect `git diff --stat`, `git status --short`, and targeted diffs.
7. Start the app and use the browser to regress auth redirects, account isolation, reader navigation, and 375 px navigation.
8. Report fixed defects, verification evidence, preserved limitations, and external integrations still required.
