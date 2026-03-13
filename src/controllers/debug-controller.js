import fs from "node:fs";
import { NodeResponse } from "../http/response.js";

export class DebugController {
  constructor(debugEnabled, fixturePath) {
    this.debugEnabled = debugEnabled;
    this.fixturePath = fixturePath;
  }

  async handle() {
    if (!this.debugEnabled) {
      return NodeResponse.json({ status: "not_found" }, 404);
    }

    const payload = fs.existsSync(this.fixturePath)
      ? JSON.parse(fs.readFileSync(this.fixturePath, "utf8"))
      : {};

    return NodeResponse.json(payload);
  }
}
