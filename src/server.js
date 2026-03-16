import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { bootstrap } from "./bootstrap.js";
import { NodeRequest } from "./http/request.js";

export async function createServer(projectRoot) {
  const app = await bootstrap(projectRoot);

  const server = http.createServer(async (incomingMessage, serverResponse) => {
    const request = await NodeRequest.fromIncomingMessage(incomingMessage);
    const response = await app.handle(request);
    response.send(serverResponse);
  });
  server.on("close", () => {
    app.stop().catch(() => {});
  });

  return { app, server };
}

export async function startServer(projectRoot) {
  const { app, server } = await createServer(projectRoot);
  const port = app.config.app.port;

  await new Promise((resolve) => {
    server.listen(port, resolve);
  });
  await app.start();

  return { app, server, port };
}

export function currentProjectRoot(importMetaUrl) {
  const currentFile = fileURLToPath(importMetaUrl);
  return path.dirname(path.dirname(currentFile));
}
