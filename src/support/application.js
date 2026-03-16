export class Application {
  constructor(router, migrationRunner, config, lifecycle = {}) {
    this.router = router;
    this.migrationRunner = migrationRunner;
    this.config = config;
    this.lifecycle = lifecycle;
  }

  async handle(request) {
    return this.router.dispatch(request);
  }

  async runMigrations() {
    await this.migrationRunner.migrate();
  }

  async start() {
    if (typeof this.lifecycle.start === "function") {
      await this.lifecycle.start();
    }
  }

  async stop() {
    if (typeof this.lifecycle.stop === "function") {
      await this.lifecycle.stop();
    }
  }
}
