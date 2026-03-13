export class BitlyService {
  constructor(httpClient, config) {
    this.httpClient = httpClient;
    this.config = config;
  }

  async shorten(longUrl) {
    if (!this.config.accessToken) {
      throw new Error("BITLY_ACCESS_TOKEN is not configured.");
    }

    const payload = {
      long_url: longUrl,
      domain: this.config.domain || "bit.ly",
      force_new_link: false
    };

    if (this.config.groupGuid) {
      payload.group_guid = this.config.groupGuid;
    }

    const response = await this.httpClient.request("POST", `${this.config.apiBase.replace(/\/$/u, "")}/shorten`, {
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`
      },
      json: payload,
      timeoutMs: this.config.timeoutMs,
      retries: 2
    });

    if (response.statusCode >= 400) {
      throw new Error(`Bitly shorten failed with status ${response.statusCode}: ${response.body}`);
    }

    const body = response.json();
    return {
      link: body.link ?? "",
      id: body.id ?? null,
      payload: body
    };
  }
}
