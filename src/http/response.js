export class NodeResponse {
  constructor(statusCode, headers, body) {
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
  }

  static json(payload, statusCode = 200) {
    return new NodeResponse(statusCode, { "Content-Type": "application/json" }, JSON.stringify(payload));
  }

  static text(payload, statusCode = 200) {
    return new NodeResponse(statusCode, { "Content-Type": "text/plain; charset=utf-8" }, payload);
  }

  send(serverResponse) {
    serverResponse.writeHead(this.statusCode, this.headers);
    serverResponse.end(this.body);
  }
}
