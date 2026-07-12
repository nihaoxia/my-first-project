import "server-only";
import { getRouteSession } from "../auth/app-session";
import { getCloudTranslationsService } from "./translations";
export const cloudTranslationsRouteDependencies = {
  getSession: getRouteSession,
  service: {
    list: (...args: Parameters<ReturnType<typeof getCloudTranslationsService>["list"]>) => getCloudTranslationsService().list(...args),
    create: (...args: Parameters<ReturnType<typeof getCloudTranslationsService>["create"]>) => getCloudTranslationsService().create(...args),
    listTasks: (...args: Parameters<ReturnType<typeof getCloudTranslationsService>["listTasks"]>) => getCloudTranslationsService().listTasks(...args),
    run: (...args: Parameters<ReturnType<typeof getCloudTranslationsService>["run"]>) => getCloudTranslationsService().run(...args),
    retry: (...args: Parameters<ReturnType<typeof getCloudTranslationsService>["retry"]>) => getCloudTranslationsService().retry(...args),
    cancel: (...args: Parameters<ReturnType<typeof getCloudTranslationsService>["cancel"]>) => getCloudTranslationsService().cancel(...args),
    getReader: (...args: Parameters<ReturnType<typeof getCloudTranslationsService>["getReader"]>) => getCloudTranslationsService().getReader(...args),
  },
};
