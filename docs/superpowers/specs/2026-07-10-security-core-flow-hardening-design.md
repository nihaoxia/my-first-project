# Security and Core-flow Hardening Design

Date: 2026-07-10

## Goal

Harden the current local-first prototype against confirmed security and data-loss bugs while making its implemented flows honest and usable. The work must preserve the existing UI and all unrelated uncommitted changes.

## Scope

This change covers:

- ignoring unsigned mock-session cookies unless mock authentication is explicitly enabled;
- rejecting login return paths that can resolve off-origin, including backslash and encoded-backslash variants;
- isolating browser-persisted books, translations, drafts, and reader data by a stable, non-plaintext user scope;
- reporting unavailable or quota-exhausted browser storage instead of silently failing;
- making chapter table-of-contents and previous/next controls perform real navigation;
- disabling or explaining reader controls whose AI/speech backends do not exist;
- preventing TXT table-of-contents entries from becoming empty chapters;
- strengthening validation of persisted local data and clarifying the local upload-size boundary;
- improving login form semantics, narrow-screen navigation, runtime requirements, and basic HTTP security headers;
- adding regression tests for every changed policy or pure data-flow function.

It explicitly does not add or pretend to add Supabase Auth, SMS delivery, AI translation, speech synthesis, a durable job queue, object storage, EPUB/MOBI/PDF parsing, or production database migrations. Those remain external integration work.

## Authentication boundary

The mock cookie is an unsigned development convenience, not a production credential. A pure environment policy determines whether the application may read it. The proxy and server-side mock-session helpers must use the same policy: enabled only when `MOCK_AUTH_ENABLED=true`, except for an intentional development default if already required by the project. Production must default to disabled. Mock cookies use `secure` in production.

Login return paths must be local absolute paths. The sanitizer rejects protocol-relative values, literal backslashes, control characters, encoded backslashes (including nested encoding), and any value that does not resolve to the fixed local origin. Invalid values fall back to `/`.

## Browser data ownership and storage errors

The authenticated application shell exposes a non-sensitive local-storage scope derived from the normalized account identifier with a stable hash. The raw phone number is never embedded in storage keys. Client storage helpers append the scope to every base key, so account A cannot read account B's local data in the same browser profile.

Unscoped legacy data is deliberately not auto-claimed by a newly signed-in account because ownership cannot be established safely. It may remain in the browser until an explicit migration/export feature exists.

Storage access goes through small safe wrappers. Reads distinguish missing, malformed, and unavailable data. Writes distinguish success, quota exhaustion, and general unavailability. UI callers show actionable messages and keep in-memory state intact where possible. Large text is not duplicated unnecessarily; the local-only flow advertises and enforces a conservative storage-safe limit rather than the server/object-storage 20 MB aspiration.

## Reader navigation

Reader URLs use `translationId` and `chapterId` query parameters produced by one pure route helper. The server page selects the requested chapter and passes the translation identity through to the workspace. Table-of-contents rows and previous/next buttons render actual links, with disabled states only at boundaries. Invalid chapter IDs fall back predictably to the default chapter.

Controls that have no implementation are visibly disabled and carry explanatory accessible text. Persisted reader study data, where retained locally, uses the same account scope as library data.

## TXT parsing and local-data validation

When a TXT document starts with a `目录` block, repeated chapter headings after that block identify the beginning of the real body. Headings inside the directory are metadata and must not create empty chapters. Ordinary heading-only documents retain current behavior.

Persisted book/translation guards validate nested chapters and required scalar fields before components consume them. Corrupt entries are ignored or surfaced as recoverable local-data errors rather than causing a render crash. Book and translation identifiers include collision-resistant input so same-name or same-language creations do not silently overwrite prior records.

## UI and platform hardening

Login fields receive visible labels, stable IDs, correct telephone/one-time-code input hints, and autocomplete metadata. Narrow navigation keeps all destinations accessible without relying on hidden horizontal overflow.

The declared Node version must support the repository's type-stripping test command. Next.js disables its identifying header and returns conservative security headers that do not break framework scripts or local development. Only schema constraints that Prisma can express reliably are added; database-only partial constraints wait for a real migration strategy.

## Verification

Each behavior change starts with a focused failing test. The final gate is:

1. all Node tests;
2. ESLint;
3. TypeScript without incremental cache;
4. Prisma schema validation with a placeholder PostgreSQL URL;
5. Next.js production build;
6. `git diff --check`;
7. browser regression of login redirect, account isolation, reader chapter navigation, and the 375 px shell.
