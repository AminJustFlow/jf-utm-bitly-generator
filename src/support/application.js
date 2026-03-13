export class Application {
  constructor(router, migrationRunner, config) {
    this.router = router;
    this.migrationRunner = migrationRunner;
    this.config = config;
  }

  async handle(request) {
    return this.router.dispatch(request);
  }

  async runMigrations() {
    await this.migrationRunner.migrate();
  }
}
