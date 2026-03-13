import { NodeResponse } from "./response.js";

export class Router {
  constructor() {
    this.routes = new Map();
  }

  add(method, path, handler) {
    this.routes.set(`${method.toUpperCase()} ${path}`, handler);
  }

  async dispatch(request) {
    const handler = this.routes.get(`${request.method} ${request.path}`);
    if (!handler) {
      return NodeResponse.json({
        status: "not_found",
        message: "Route not found."
      }, 404);
    }

    return handler(request);
  }
}
