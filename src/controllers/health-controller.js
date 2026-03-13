import { NodeResponse } from "../http/response.js";

export class HealthController {
  constructor(database) {
    this.database = database;
  }

  async handle() {
    try {
      this.database.prepare("SELECT 1 AS ok").get();

      return NodeResponse.json({
        status: "ok",
        database: "ok",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return NodeResponse.json({
        status: "degraded",
        database: "error",
        error: error.message
      }, 500);
    }
  }
}
