import { ParsedLinkRequest } from "../domain/parsed-link-request.js";

export class OpenAIParserService {
  constructor(httpClient, config, rulesService) {
    this.httpClient = httpClient;
    this.config = config;
    this.rulesService = rulesService;
  }

  async parse(message) {
    if (!this.config.apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const parserContext = this.rulesService.buildParserContext(message);
    const promptLines = [
      "You are a parser for JF marketing link requests.",
      "Return JSON only that matches the provided schema.",
      "Never invent unsupported clients or channels.",
      "If a value is ambiguous or unsupported, leave the field null, add a warning, and include the field name in missing_fields.",
      "Correct obvious spelling mistakes in client names, channel names, campaign_label, and explicit UTM values when there is one clear correction.",
      "If there is not one clear correction, lower confidence and ask for clarification through warnings instead of guessing.",
      "Preserve approved workbook-style UTM values exactly, including case, when they are implied by the request or clearly match the likely client taxonomy.",
      "Use exact approved source, medium, campaign, term, and content values when one client-specific combination is clearly implied.",
      "If the request only gives a plain-language campaign and the taxonomy does not clearly resolve the final UTM values, set campaign_label and leave unresolved utm_* fields null.",
      "Only set needs_qr=true if the user explicitly requests QR, flyer, print, brochure, postcard, or offline use.",
      `Supported clients and aliases: ${JSON.stringify(parserContext.summary.clients)}`,
      `Supported channels and aliases: ${JSON.stringify(parserContext.summary.channels)}`,
      `Supported asset types: ${JSON.stringify(parserContext.summary.asset_types)}`
    ];

    if (parserContext.likely_client) {
      promptLines.push(`Likely client context: ${JSON.stringify(parserContext.likely_client)}`);
    }

    if (parserContext.likely_channel) {
      promptLines.push(`Likely channel context: ${JSON.stringify(parserContext.likely_channel)}`);
    }

    const payload = {
      model: this.config.model,
      temperature: this.config.temperature ?? 0.1,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: promptLines.join("\n")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: message
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "jf_link_request",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              client: { type: ["string", "null"] },
              channel: { type: ["string", "null"] },
              asset_type: { type: ["string", "null"], enum: ["social", "email", "pr", "offline", "paid", "owned", null] },
              campaign_label: { type: ["string", "null"] },
              utm_source: { type: ["string", "null"] },
              utm_medium: { type: ["string", "null"] },
              utm_campaign: { type: ["string", "null"] },
              utm_term: { type: ["string", "null"] },
              utm_content: { type: ["string", "null"] },
              destination_url: { type: ["string", "null"] },
              needs_qr: { type: "boolean" },
              confidence: { type: "number" },
              warnings: {
                type: "array",
                items: { type: "string" }
              },
              missing_fields: {
                type: "array",
                items: { type: "string" }
              }
            },
            required: [
              "client",
              "channel",
              "asset_type",
              "campaign_label",
              "utm_source",
              "utm_medium",
              "utm_campaign",
              "utm_term",
              "utm_content",
              "destination_url",
              "needs_qr",
              "confidence",
              "warnings",
              "missing_fields"
            ]
          }
        }
      }
    };

    const response = await this.httpClient.request("POST", `${this.config.apiBase.replace(/\/$/u, "")}/responses`, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`
      },
      json: payload,
      timeoutMs: this.config.timeoutMs,
      retries: 2
    });

    if (response.statusCode >= 400) {
      throw new Error(`OpenAI parse failed with status ${response.statusCode}: ${response.body}`);
    }

    const responseBody = response.json();
    const outputText = responseBody.output_text ?? extractOutputText(responseBody.output ?? []);

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error("OpenAI response was not valid JSON.");
    }

    return ParsedLinkRequest.fromObject(parsed, "openai", {
      responseId: responseBody.id ?? null,
      model: responseBody.model ?? this.config.model
    });
  }
}

function extractOutputText(outputItems) {
  for (const output of outputItems) {
    for (const content of output.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  throw new Error("OpenAI response did not include output text.");
}
