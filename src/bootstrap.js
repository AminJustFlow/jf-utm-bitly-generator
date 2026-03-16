import { createAnalyticsWorker, createApplication } from "./support/app-factory.js";

export async function bootstrap(projectRoot) {
  return createApplication(projectRoot);
}

export async function bootstrapAnalyticsWorker(projectRoot) {
  return createAnalyticsWorker(projectRoot);
}
