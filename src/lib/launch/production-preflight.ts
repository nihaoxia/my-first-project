export type ProductionEnvKey =
  | "DATABASE_URL"
  | "DIRECT_URL"
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "MOCK_AUTH_ENABLED"
  | "NEXT_PUBLIC_APP_URL";

export type ProductionEnvRequirement = {
  key: ProductionEnvKey;
  label: string;
  required: true;
  sensitive: boolean;
};

export type ProductionPreflightInput = Partial<Record<ProductionEnvKey, string | undefined>>;

export type ProductionPreflightResult = {
  ready: boolean;
  requiredCount: number;
  readyCount: number;
  missingKeys: ProductionEnvKey[];
  placeholderKeys: ProductionEnvKey[];
  risks: string[];
};

export type ProductionRolloutStep = {
  label: string;
  owner: "deployment" | "database" | "auth" | "provider" | "queue" | "quality";
};

const placeholderPatterns = [/^your-/i, /^replace-/i, /^todo$/i, /^changeme$/i, /^example$/i];

const productionEnvRequirements: ProductionEnvRequirement[] = [
  {
    key: "DATABASE_URL",
    label: "生产数据库连接串",
    required: true,
    sensitive: true,
  },
  {
    key: "DIRECT_URL",
    label: "Prisma 迁移直连地址",
    required: true,
    sensitive: true,
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    label: "Supabase 项目 URL",
    required: true,
    sensitive: false,
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    label: "Supabase 浏览器匿名 key",
    required: true,
    sensitive: true,
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase 服务端 key",
    required: true,
    sensitive: true,
  },
  {
    key: "MOCK_AUTH_ENABLED",
    label: "开发期 mock 登录开关",
    required: true,
    sensitive: false,
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    label: "生产站点 URL",
    required: true,
    sensitive: false,
  },
];

const rolloutSteps: ProductionRolloutStep[] = [
  { label: "配置 Vercel 项目、生产域名和回滚方案", owner: "deployment" },
  { label: "接入 Supabase 生产数据库和 Storage", owner: "database" },
  { label: "关闭开发期 mock 登录并接入真实登录链路", owner: "auth" },
  { label: "接入真实短信、支付和 AI Provider", owner: "provider" },
  { label: "接入真实后台队列", owner: "queue" },
  { label: "执行截图级视觉验收", owner: "quality" },
];

export function getProductionEnvRequirements() {
  return productionEnvRequirements;
}

export function evaluateProductionPreflight(
  input: ProductionPreflightInput,
): ProductionPreflightResult {
  const missingKeys: ProductionEnvKey[] = [];
  const placeholderKeys: ProductionEnvKey[] = [];
  const risks: string[] = [];

  for (const requirement of productionEnvRequirements) {
    const value = normalizeEnvValue(input[requirement.key]);

    if (!value) {
      missingKeys.push(requirement.key);
      continue;
    }

    if (isPlaceholderValue(value)) {
      placeholderKeys.push(requirement.key);
    }
  }

  const supabaseUrl = normalizeEnvValue(input.NEXT_PUBLIC_SUPABASE_URL);
  if (supabaseUrl && !isHttpsUrl(supabaseUrl)) {
    risks.push("Supabase URL 必须是有效的 HTTPS 地址。");
  }

  const appUrl = normalizeEnvValue(input.NEXT_PUBLIC_APP_URL);
  if (appUrl && !isHttpsUrl(appUrl)) {
    risks.push("生产站点 URL 必须使用 HTTPS。");
  }

  if (normalizeEnvValue(input.MOCK_AUTH_ENABLED) !== "false") {
    risks.push("生产环境必须关闭开发期 mock 登录。");
  }

  const readyCount = productionEnvRequirements.length - missingKeys.length - placeholderKeys.length;

  return {
    ready: missingKeys.length === 0 && placeholderKeys.length === 0 && risks.length === 0,
    requiredCount: productionEnvRequirements.length,
    readyCount,
    missingKeys,
    placeholderKeys,
    risks,
  };
}

export function getProductionRolloutSteps() {
  return rolloutSteps;
}

function normalizeEnvValue(value: string | undefined) {
  return value?.trim() ?? "";
}

function isPlaceholderValue(value: string) {
  return placeholderPatterns.some((pattern) => pattern.test(value));
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}
