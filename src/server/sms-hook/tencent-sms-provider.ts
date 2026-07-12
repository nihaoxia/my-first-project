import { sms } from "tencentcloud-sdk-nodejs-sms";

import type { SendSmsMessage } from "./hook-core.ts";
import type { SmsHookConfig } from "./config.ts";

type SendSmsRequest = {
  SmsSdkAppId: string;
  SignName: string;
  TemplateId: string;
  PhoneNumberSet: string[];
  TemplateParamSet: string[];
};

type SendSmsResponse = {
  SendStatusSet?: Array<{ Code?: string }>;
};

export type TencentSmsClient = {
  SendSms(request: SendSmsRequest): Promise<SendSmsResponse>;
};

export function createTencentSmsSender(input: {
  sdkAppId: string;
  signName: string;
  templateId: string;
  client: TencentSmsClient;
}) {
  return async (message: SendSmsMessage): Promise<void> => {
    try {
      const response = await input.client.SendSms({
        SmsSdkAppId: input.sdkAppId,
        SignName: input.signName,
        TemplateId: input.templateId,
        PhoneNumberSet: [message.phone],
        TemplateParamSet: [message.token],
      });
      if (
        response.SendStatusSet?.length !== 1 ||
        response.SendStatusSet[0]?.Code !== "Ok"
      ) throw providerFailure();
    } catch {
      throw providerFailure();
    }
  };
}

export function createTencentSmsSenderFromConfig(config: SmsHookConfig) {
  const Client = sms.v20210111.Client;
  const client = new Client({
    credential: {
      secretId: config.secretId,
      secretKey: config.secretKey,
    },
    region: config.region,
    profile: {
      httpProfile: { endpoint: "sms.tencentcloudapi.com" },
    },
  });
  return createTencentSmsSender({
    sdkAppId: config.sdkAppId,
    signName: config.signName,
    templateId: config.templateId,
    client,
  });
}

function providerFailure() {
  return { code: "SMS_PROVIDER_FAILED" as const };
}
