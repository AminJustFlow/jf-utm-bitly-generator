export class HttpClient {
  async request(method, url, options = {}) {
    const {
      headers = {},
      json,
      body,
      timeoutMs = 10000,
      retries = 0,
      retryOnStatus = [429, 500, 502, 503, 504]
    } = options;

    const requestHeaders = { ...headers };
    let payload = body;

    if (json !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
      payload = JSON.stringify(json);
    }

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: payload,
          signal: controller.signal
        });

        const responseBody = await response.text();
        clearTimeout(timeout);

        if (retryOnStatus.includes(response.status) && attempt < retries) {
          await delay(backoffDelay(attempt));
          continue;
        }

        return {
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: responseBody,
          json() {
            try {
              return JSON.parse(responseBody);
            } catch {
              return {};
            }
          }
        };
      } catch (error) {
        clearTimeout(timeout);

        if (attempt < retries) {
          await delay(backoffDelay(attempt));
          continue;
        }

        throw error;
      }
    }

    throw new Error("HTTP request failed after retries.");
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function backoffDelay(attempt) {
  return 100 * (2 ** attempt);
}
