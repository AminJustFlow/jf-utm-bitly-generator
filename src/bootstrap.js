import { createApplication } from "./support/app-factory.js";

export async function bootstrap(projectRoot) {
  return createApplication(projectRoot);
}
