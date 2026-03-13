export default {
  assetTypes: ["social", "email", "pr", "offline", "paid", "owned"],
  clients: {
    studleys: {
      displayName: "Studleys",
      aliases: ["studley", "studleys", "studley's"],
      domains: ["studleys.com"],
      utmDefaults: {
        website: {
          source: "Navigation",
          medium: "Website",
          campaign: "PlantFinder",
          term: "",
          content: "PlantFinder"
        }
      }
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
      domains: ["justflownh.com"],
      utmDefaults: {
        linkedin: {
          campaign: "Website",
          term: "",
          content: "Contact"
        }
      }
    },
    castle: {
      displayName: "Castle In The Clouds",
      aliases: ["castle", "castle in the clouds", "castleintheclouds"],
      domains: ["castleintheclouds.org"],
      utmDefaults: {
        domain: {
          source: "CastleAdventure",
          medium: "Domain",
          campaign: "Ads",
          term: "HomePage",
          content: "Visitation"
        }
      }
    }
  },
  channels: {
    facebook: {
      displayName: "Facebook",
      aliases: ["facebook", "fb"],
      assetType: "social",
      requiresQr: false,
      utmDefaults: {
        source: "Facebook",
        medium: "Social",
        campaign: null,
        term: "",
        content: ""
      }
    },
    instagram: {
      displayName: "Instagram",
      aliases: ["instagram", "ig"],
      assetType: "social",
      requiresQr: false,
      utmDefaults: {
        source: "Instagram",
        medium: "Social",
        campaign: null,
        term: "",
        content: ""
      }
    },
    linkedin: {
      displayName: "LinkedIn",
      aliases: ["linkedin", "li"],
      assetType: "social",
      requiresQr: false,
      utmDefaults: {
        source: "LinkedIn",
        medium: "Social",
        campaign: null,
        term: "",
        content: ""
      }
    },
    email: {
      displayName: "Email",
      aliases: ["email", "newsletter"],
      assetType: "email",
      requiresQr: false,
      utmDefaults: {
        source: "Newsletter",
        medium: "Email",
        campaign: null,
        term: "",
        content: ""
      }
    },
    pr: {
      displayName: "PR",
      aliases: ["pr", "press"],
      assetType: "pr",
      requiresQr: false,
      utmDefaults: {
        source: "Press",
        medium: "PR",
        campaign: null,
        term: "",
        content: ""
      }
    },
    qr: {
      displayName: "QR",
      aliases: ["qr", "flyer", "print"],
      assetType: "offline",
      requiresQr: true,
      utmDefaults: {
        source: "QR",
        medium: "Offline",
        campaign: null,
        term: "",
        content: ""
      }
    },
    google_ads: {
      displayName: "Google Ads",
      aliases: ["google ads", "gads", "google_ads", "googleads"],
      assetType: "paid",
      requiresQr: false,
      utmDefaults: {
        source: "Google",
        medium: "CPC",
        campaign: null,
        term: "",
        content: ""
      }
    },
    website: {
      displayName: "Website",
      aliases: ["website", "site", "navigation", "plant finder", "plantfinder"],
      assetType: "owned",
      requiresQr: false,
      utmDefaults: {
        source: "Website",
        medium: "Website",
        campaign: "Website",
        term: "",
        content: ""
      }
    },
    domain: {
      displayName: "Domain",
      aliases: ["domain", "direct", "vanity domain"],
      assetType: "owned",
      requiresQr: false,
      utmDefaults: {
        source: "Domain",
        medium: "Domain",
        campaign: "Website",
        term: "",
        content: ""
      }
    }
  },
  campaignLabelAliases: {
    guide: "guide",
    flyer: "flyer",
    brochure: "brochure"
  }
};
