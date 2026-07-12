const requiredKeys = [
  "SMS_HOOK_SECRET",
  "TENCENTCLOUD_SECRET_ID",
  "TENCENTCLOUD_SECRET_KEY",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID",
  "TENCENT_SMS_REGION",
] as const;

export type SmsHookConfig = {
  port: number;
  webhookSecretBase64: string;
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: "ap-guangzhou";
};

export type SmsHookConfigResult =
  | { ok: true; value: SmsHookConfig }
  | {
      ok: false;
      error: {
        code: "SMS_HOOK_NOT_CONFIGURED" | "SMS_HOOK_CONFIG_INVALID";
        keys: string[];
      };
    };

export function parseSmsHookConfig(
  env: Record<string, string | undefined>,
): SmsHookConfigResult {
  const missingKeys = requiredKeys.filter((key) => !env[key]?.trim());
  if (missingKeys.length > 0) {
    return {
      ok: false,
      error: { code: "SMS_HOOK_NOT_CONFIGURED", keys: [...missingKeys] },
    };
  }

  const secretId = env.TENCENTCLOUD_SECRET_ID!.trim();
  const secretKey = env.TENCENTCLOUD_SECRET_KEY!.trim();
  const sdkAppId = env.TENCENT_SMS_SDK_APP_ID!.trim();
  const signName = env.TENCENT_SMS_SIGN_NAME!.trim();
  const templateId = env.TENCENT_SMS_TEMPLATE_ID!.trim();
  const region = env.TENCENT_SMS_REGION!.trim();
  const portText = env.SMS_HOOK_PORT?.trim() || "9000";
  const port = Number(portText);
  const webhookSecretBase64 = parseWebhookSecret(env.SMS_HOOK_SECRET!.trim());
  const invalidKeys: string[] = [];

  if (!webhookSecretBase64) invalidKeys.push("SMS_HOOK_SECRET");
  if (!isBoundedCredential(secretId)) invalidKeys.push("TENCENTCLOUD_SECRET_ID");
  if (!isBoundedCredential(secretKey)) invalidKeys.push("TENCENTCLOUD_SECRET_KEY");
  if (!/^\d{5,20}$/.test(sdkAppId)) invalidKeys.push("TENCENT_SMS_SDK_APP_ID");
  if (!signName || signName.length > 50 || /[\u0000-\u001f\u007f]/.test(signName)) {
    invalidKeys.push("TENCENT_SMS_SIGN_NAME");
  }
  if (!/^\d{1,20}$/.test(templateId)) invalidKeys.push("TENCENT_SMS_TEMPLATE_ID");
  if (region !== "ap-guangzhou") invalidKeys.push("TENCENT_SMS_REGION");
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    invalidKeys.push("SMS_HOOK_PORT");
  }

  if (invalidKeys.length > 0 || !webhookSecretBase64) {
    return {
      ok: false,
      error: { code: "SMS_HOOK_CONFIG_INVALID", keys: invalidKeys },
    };
  }

  return {
    ok: true,
    value: {
      port,
      webhookSecretBase64,
      secretId,
      secretKey,
      sdkAppId,
      signName,
      templateId,
      region: "ap-guangzhou",
    },
  };
}

function isBoundedCredential(value: string) {
  return value.length >= 20 && value.length <= 256 && !/[\s\u0000-\u001f\u007f]/.test(value);
}

function parseWebhookSecret(value: string): string | null {
  const prefix = "v1,whsec_";
  if (!value.startsWith(prefix)) return null;
  const encoded = value.slice(prefix.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    return null;
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length < 32 || decoded.toString("base64") !== encoded) return null;
  return encoded;
}
