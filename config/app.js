export default {
  app: {
    name: "JF Link Generator Bot",
    env: "production",
    url: "http://localhost:3000",
    debug: false,
    port: 3000,
    timezone: "America/New_York",
    confidenceThreshold: 0.72,
    rateLimit: 20,
    rateWindowSeconds: 300,
    recoveryEnabled: true,
    recoveryPollMs: 30000,
    recoveryGraceSeconds: 30,
    recoveryBatchSize: 25
  },
  database: {
    path: "storage/database/app.sqlite"
  },
  logging: {
    path: "storage/logs/app.log"
  },
  openai: {
    apiKey: "",
    model: "gpt-4.1-mini",
    apiBase: "https://api.openai.com/v1",
    temperature: 0.1,
    timeoutMs: 12000
  },
  clickup: {
    apiToken: "",
    workspaceId: "",
    defaultChannelId: "",
    allowedChannelIds: [],
    webhookSecret: "",
    signatureHeader: "X-Signature",
    debugWebhook: false,
    debugSkipSignature: false,
    debugSkipChannelCheck: false,
    debugSkipWorkspaceCheck: false,
    apiBase: "https://api.clickup.com/api/v3",
    messageContentField: "content",
    messageFallbackField: "text_content",
    ignoreUserIds: [],
    ignoreUsernames: [],
    timeoutMs: 8000
  },
  bitly: {
    accessToken: "",
    domain: "bit.ly",
    groupGuid: "",
    apiBase: "https://api-ssl.bitly.com/v4",
    timeoutMs: 8000
  },
  qr: {
    baseUrl: "https://api.qrserver.com/v1/create-qr-code/",
    size: "300x300"
  },
  tracking: {
    secretEncryptionKey: "",
    signatureMaxAgeSeconds: 300
  },
  libraryAuth: {
    enabled: true,
    username: "justflow",
    password: "preview",
    realm: "JF Link Manager"
  }
};
