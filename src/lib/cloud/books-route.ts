import "server-only";

import { getAppSession } from "../auth/app-session";
import { getCloudBooksService } from "./books";
import type { CloudBooksRouteDependencies } from "./books-route-core";

const service: CloudBooksRouteDependencies["service"] = {
  list: (userId) => getCloudBooksService().list(userId),
  create: (userId, input) => getCloudBooksService().create(userId, input),
  get: (userId, bookId) => getCloudBooksService().get(userId, bookId),
  updateMetadata: (userId, bookId, input) => getCloudBooksService().updateMetadata(userId, bookId, input),
  delete: (userId, bookId) => getCloudBooksService().delete(userId, bookId),
  getDownloadUrl: (userId, bookId) => getCloudBooksService().getDownloadUrl(userId, bookId),
};

export const cloudBooksRouteDependencies: CloudBooksRouteDependencies = { getSession: getAppSession, service };
