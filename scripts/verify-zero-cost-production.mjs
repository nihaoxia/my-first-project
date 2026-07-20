import { readFile } from "node:fs/promises";
import { extname, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const defaultRoot = resolve(import.meta.dirname, "..");
const paths = {
  deployment: "edgeone.json",
  deploymentReference: "deploy/edgeone/edgeone.json",
  environment: "deploy/edgeone/env.example",
  factory: "src/lib/cloud/service-factory.ts",
  blobQuota: "src/lib/cloud/edgeone-storage-provider.ts",
  modelQuota: "src/lib/cloud/edgeone-translation-quota-core.ts",
};
const ALLOWED_DEPLOYMENT_FIELDS = [
  "name",
  "installCommand",
  "buildCommand",
  "nodeVersion",
  "headers",
  "cloudFunctions",
];
const ALLOWED_EXTERNAL_PRODUCTION_IMPORTS = new Set([
  "server-only",
  "@edgeone/pages-blob",
  "@noble/hashes/hmac.js",
  "@noble/hashes/scrypt.js",
  "@noble/hashes/sha2.js",
  "@noble/hashes/utils.js",
]);

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, allowed, code) {
  assert(isRecord(value), code);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  assert(JSON.stringify(actual) === JSON.stringify(expected), code);
}

async function load(root, path) {
  try {
    return await readFile(resolve(root, path), "utf8");
  } catch {
    fail("REQUIRED_FILE_MISSING");
  }
}

function parseDeployment(source) {
  let deployment;
  try {
    deployment = JSON.parse(source);
  } catch {
    fail("INVALID_EDGEONE_DEPLOYMENT_JSON");
  }
  assertExactKeys(deployment, ALLOWED_DEPLOYMENT_FIELDS, "UNKNOWN_DEPLOYMENT_FIELD");
  assert(deployment.name === "stray-pages", "INVALID_PROJECT_NAME");
  assert(deployment.installCommand === "pnpm install --frozen-lockfile", "INVALID_INSTALL_COMMAND");
  assert(deployment.buildCommand === "pnpm build", "INVALID_BUILD_COMMAND");
  assert(deployment.nodeVersion === "22.11.0", "INVALID_NODE_VERSION");

  assertExactKeys(
    deployment.cloudFunctions,
    ["mainlandRegions", "nodejs"],
    "UNKNOWN_CLOUD_FUNCTION_FIELD",
  );
  assert(
    JSON.stringify(deployment.cloudFunctions.mainlandRegions) === '["ap-guangzhou"]',
    "INVALID_FUNCTION_REGION",
  );
  assertExactKeys(
    deployment.cloudFunctions.nodejs,
    ["maxDuration"],
    "UNKNOWN_NODE_FUNCTION_FIELD",
  );
  assert(
    Number.isInteger(deployment.cloudFunctions.nodejs.maxDuration) &&
      deployment.cloudFunctions.nodejs.maxDuration >= 10 &&
      deployment.cloudFunctions.nodejs.maxDuration <= 120,
    "INVALID_FUNCTION_DURATION",
  );

  assert(Array.isArray(deployment.headers) && deployment.headers.length === 1, "INVALID_HEADERS");
  const headerRule = deployment.headers[0];
  assertExactKeys(headerRule, ["source", "headers"], "UNKNOWN_HEADER_RULE_FIELD");
  assert(headerRule.source === "/*" && Array.isArray(headerRule.headers), "INVALID_HEADERS");
  const headers = new Map();
  for (const header of headerRule.headers) {
    assertExactKeys(header, ["key", "value"], "UNKNOWN_HEADER_FIELD");
    assert(typeof header.key === "string" && typeof header.value === "string", "INVALID_HEADERS");
    const key = header.key.toLowerCase();
    assert(!headers.has(key), "DUPLICATE_HEADER");
    headers.set(key, header.value);
  }
  assert(headers.get("x-content-type-options") === "nosniff", "MISSING_SECURITY_HEADER");
  assert(headers.get("x-frame-options") === "DENY", "MISSING_SECURITY_HEADER");
  assert(/strict-origin/iu.test(headers.get("referrer-policy") ?? ""), "MISSING_SECURITY_HEADER");
  assert(/default-src 'self'/iu.test(headers.get("content-security-policy") ?? ""), "MISSING_SECURITY_HEADER");
  assert(/frame-ancestors 'none'/iu.test(headers.get("content-security-policy") ?? ""), "MISSING_SECURITY_HEADER");
  return deployment;
}

function parseTypeScript(source) {
  const sourceFile = ts.createSourceFile(
    "zero-cost-production.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert(sourceFile.parseDiagnostics.length === 0, "INVALID_TYPESCRIPT_SOURCE");
  return sourceFile;
}

function extractImportSpecifiers(source) {
  const imports = [];
  for (const statement of parseTypeScript(source).statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
    ) imports.push(statement.moduleSpecifier.text);
  }
  return imports;
}

function assertNoDynamicDependencies(source) {
  const sourceFile = parseTypeScript(source);
  let forbidden = false;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) forbidden = true;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert(!forbidden, "DYNAMIC_IMPORT_FORBIDDEN");
}

function hasCentralBlobWriteGate(source) {
  const sourceFile = parseTypeScript(source);
  let imported = false;
  let called = false;
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "../edgeone/blob-store-core"
    ) {
      const bindings = statement.importClause?.namedBindings;
      imported = Boolean(
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.some((element) => element.name.text === "createWriteGatedAuthoritativeBlobStore"),
      );
    }
  }
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "createWriteGatedAuthoritativeBlobStore" &&
      node.arguments.length >= 2
    ) {
      const flag = node.arguments[1];
      called = ts.isPropertyAccessExpression(flag) &&
        ts.isIdentifier(flag.expression) &&
        flag.expression.text === "config" &&
        flag.name.text === "freeBlobConfirmed";
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imported && called;
}

async function resolveLocalModule(file, specifier) {
  const unresolved = resolve(dirname(file), specifier);
  const candidates = extname(unresolved)
    ? [unresolved]
    : [unresolved, `${unresolved}.ts`, `${unresolved}.tsx`, `${unresolved}.js`, join(unresolved, "index.ts")];
  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Try the next deterministic TypeScript/JavaScript resolution candidate.
    }
  }
  fail("PRODUCTION_GRAPH_MODULE_MISSING");
}

async function verifyProductionImportGraph(root, entryPath) {
  const pending = [resolve(root, entryPath)];
  const visited = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    let source;
    try {
      source = await readFile(file, "utf8");
    } catch {
      fail("PRODUCTION_GRAPH_MODULE_MISSING");
    }
    assertNoDynamicDependencies(source);
    for (const specifier of extractImportSpecifiers(source)) {
      if (specifier.startsWith(".")) {
        pending.push(await resolveLocalModule(file, specifier));
      } else {
        assert(ALLOWED_EXTERNAL_PRODUCTION_IMPORTS.has(specifier), "EXTERNAL_PRODUCTION_IMPORT_FORBIDDEN");
      }
    }
  }
}

export function verifyZeroCostSources(source) {
  parseDeployment(source.deployment);
  assert(source.deploymentReference === source.deployment, "DEPLOYMENT_CONTRACT_DRIFT");

  const artifactSource = `${source.deployment}\n${source.environment}`;
  assert(
    !/docker|tcr|cos|sms|cvm|runinstances|createinstances|buy\.cloud|purchase/iu.test(artifactSource),
    "PAID_RESOURCE_PATH_FORBIDDEN",
  );
  const entries = source.environment
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  const allowedEnvironment = [
    "AUTH_MODE=edgeone",
    "CLOUD_DATA_PROVIDER=edgeone",
    "CLOUD_STORAGE_PROVIDER=edgeone",
    "EDGEONE_BLOB_STORE=",
    "EDGEONE_SESSION_SECRET=",
    "EDGEONE_FREE_BLOB_CONFIRMED=false",
    "EDGEONE_FREE_MODEL_CONFIRMED=false",
    "MAKERS_MODELS_KEY=",
    "EDGEONE_PRODUCTION_ORIGIN=",
  ];
  assert(JSON.stringify(entries) === JSON.stringify(allowedEnvironment), "INVALID_EDGEONE_ENVIRONMENT");

  assertNoDynamicDependencies(source.factory);
  const directImports = extractImportSpecifiers(source.factory);
  assert(!directImports.some((value) => /prisma|supabase|cos|sms|mcp/iu.test(value)), "PAID_FACTORY_IMPORT_FORBIDDEN");
  assert(hasCentralBlobWriteGate(source.factory), "BLOB_WRITE_GATE_MISSING");
  assert(
    /EDGEONE_BLOB_QUOTA_LEDGER_ID\s*=\s*"blob-storage-global"/u.test(source.blobQuota),
    "BLOB_LEDGER_NOT_GLOBAL",
  );
  assert(
    /EDGEONE_MODEL_QUOTA_LEDGER_ID\s*=\s*"translation-model-global"/u.test(source.modelQuota),
    "MODEL_LEDGER_NOT_GLOBAL",
  );
  return { ok: true };
}

export async function verifyZeroCostProduction(root = defaultRoot) {
  const source = Object.fromEntries(
    await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await load(root, path)])),
  );
  verifyZeroCostSources(source);
  await verifyProductionImportGraph(root, paths.factory);
  return { ok: true };
}

function parseRootArgument(args) {
  if (args.length === 0) return defaultRoot;
  if (args.length === 2 && args[0] === "--root" && args[1]) return resolve(args[1]);
  fail("INVALID_ARGUMENTS");
}

const isMain = Boolean(process.argv[1]) && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    await verifyZeroCostProduction(parseRootArgument(process.argv.slice(2)));
    process.stdout.write("zero-cost production contract: ok\n");
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "ZERO_COST_VERIFICATION_FAILED";
    process.stderr.write(`zero-cost production contract: ${code}\n`);
    process.exitCode = 1;
  }
}
