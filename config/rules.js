export default {
  assetTypes: ["social", "email", "pr", "offline", "paid"],
  clients: {
    studleys: {
      displayName: "Studleys",
      aliases: ["studley", "studleys", "studley's"],
      domains: ["studleys.com"]
    },
    gas: {
      displayName: "GAS",
      aliases: ["gas", "guardian angel", "guardian angel senior services"],
      domains: ["guardianangelseniorservices.com"]
    },
    woodstone: {
      displayName: "Woodstone",
      aliases: ["woodstone", "woodstone homes"],
      domains: ["woodstonehomesnh.com"]
    },
    serenity: {
      displayName: "Serenity",
      aliases: ["serenity"],
      domains: []
    },
    jf: {
      displayName: "JF",
      aliases: ["jf", "just flow", "justflow"],
      domains: []
    }
  },
  channels: {
    facebook: {
      displayName: "Facebook",
      aliases: ["facebook", "fb"],
      source: "facebook",
      medium: "social",
      assetType: "social",
      requiresQr: false
    },
    instagram: {
      displayName: "Instagram",
      aliases: ["instagram", "ig"],
      source: "instagram",
      medium: "social",
      assetType: "social",
      requiresQr: false
    },
    linkedin: {
      displayName: "LinkedIn",
      aliases: ["linkedin", "li"],
      source: "linkedin",
      medium: "social",
      assetType: "social",
      requiresQr: false
    },
    email: {
      displayName: "Email",
      aliases: ["email", "newsletter"],
      source: "newsletter",
      medium: "email",
      assetType: "email",
      requiresQr: false
    },
    pr: {
      displayName: "PR",
      aliases: ["pr", "press"],
      source: "press",
      medium: "pr",
      assetType: "pr",
      requiresQr: false
    },
    qr: {
      displayName: "QR",
      aliases: ["qr", "flyer", "print"],
      source: "qr",
      medium: "offline",
      assetType: "offline",
      requiresQr: true
    },
    google_ads: {
      displayName: "Google Ads",
      aliases: ["google ads", "gads", "google_ads", "googleads"],
      source: "google",
      medium: "cpc",
      assetType: "paid",
      requiresQr: false
    }
  },
  campaignLabelAliases: {
    guide: "guide",
    flyer: "flyer",
    brochure: "brochure"
  }
};
