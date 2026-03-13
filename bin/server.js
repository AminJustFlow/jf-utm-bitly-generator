import { startServer, currentProjectRoot } from "../src/server.js";

const projectRoot = currentProjectRoot(import.meta.url);
const { port } = await startServer(projectRoot);

process.stdout.write(`JF Link Generator Bot listening on port ${port}\n`);
