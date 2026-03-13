import { bootstrap } from "../src/bootstrap.js";
import { currentProjectRoot } from "../src/server.js";

const app = await bootstrap(currentProjectRoot(import.meta.url));
await app.runMigrations();

process.stdout.write("Migrations completed.\n");
