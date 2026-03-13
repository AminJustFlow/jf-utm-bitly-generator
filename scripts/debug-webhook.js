import fs from "node:fs";
import path from "node:path";

const options = parseArgs(process.argv.slice(2));
const fixturePath = path.resolve(options.fixture ?? "tests/fixtures/clickup-chat-message.json");
const url = options.url ?? "http://127.0.0.1:3000/webhooks/clickup/chat";
const signatureHeader = options["signature-header"] ?? "X-Signature";

if (!fs.existsSync(fixturePath)) {
  process.stderr.write(`Fixture not found: ${fixturePath}\n`);
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json"
};

for (const header of options.headers) {
  const separator = header.indexOf(":");
  if (separator === -1) {
    process.stderr.write(`Invalid --header value: ${header}\n`);
    process.exit(1);
  }

  const key = header.slice(0, separator).trim();
  const value = header.slice(separator + 1).trim();
  headers[key] = value;
}

if (!options["skip-signature"]) {
  const signature = options.signature ?? process.env.CLICKUP_WEBHOOK_SECRET ?? "";
  if (signature) {
    headers[signatureHeader] = signature;
  }
}

const body = fs.readFileSync(fixturePath, "utf8");

process.stdout.write(`POST ${url}\n`);
process.stdout.write(`Fixture: ${fixturePath}\n`);
process.stdout.write(`Signature header sent: ${headers[signatureHeader] ? "yes" : "no"}\n`);

const response = await fetch(url, {
  method: "POST",
  headers,
  body
});

const responseBody = await response.text();
const correlationId = response.headers.get("x-correlation-id");

process.stdout.write(`Status: ${response.status}\n`);
if (correlationId) {
  process.stdout.write(`Correlation ID: ${correlationId}\n`);
}

process.stdout.write("Response body:\n");
process.stdout.write(`${formatBody(responseBody)}\n`);

if (!headers[signatureHeader]) {
  process.stdout.write("\nNote: no signature header was sent. Use DEBUG_WEBHOOK_SKIP_SIGNATURE=true only for temporary debugging.\n");
}

function parseArgs(args) {
  const parsed = {
    headers: []
  };

  for (const argument of args) {
    if (!argument.startsWith("--")) {
      continue;
    }

    const [rawKey, ...rest] = argument.slice(2).split("=");
    const key = rawKey.trim();
    const value = rest.join("=");

    if (key === "header") {
      parsed.headers.push(value);
      continue;
    }

    if (value === "") {
      parsed[key] = true;
      continue;
    }

    parsed[key] = value;
  }

  return parsed;
}

function formatBody(body) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
