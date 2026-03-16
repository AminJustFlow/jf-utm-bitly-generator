import workbookTaxonomy from "./workbook-taxonomy.js";

const manualClients = {
  studleys: {
    displayName: "Studleys",
    aliases: ["studley", "studleys", "studley's", "sfg"],
    domains: ["studleys.com", "plants.studleys.com"],
    taxonomyKey: "sfg",
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
    domains: ["guardianangelseniorservices.com"],
    taxonomyKey: "gas"
  },
  jf: {
    displayName: "JF",
    aliases: ["jf", "just flow", "justflow"],
    domains: ["justflownh.com"],
    taxonomyKey: "jf"
  },
  castle: {
    displayName: "Castle In The Clouds",
    aliases: ["castle", "castle in the clouds", "castleintheclouds", "cic"],
    domains: ["castleintheclouds.org"],
    taxonomyKey: "cic"
  },
  "900": {
    displayName: "900",
    aliases: ["900", "900 degrees", "900degrees"],
    domains: ["900degrees.com"],
    taxonomyKey: "900"
  },
  aaa: {
    displayName: "AAA",
    aliases: ["aaa", "aaa pump", "aaa pump service"],
    domains: ["aaapumpservice.com"],
    taxonomyKey: "aaa"
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
  }
};

const staticChannels = {
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
    aliases: ["qr", "flyer", "print", "brochure", "postcard"],
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
};

const manualTaxonomyMappings = new Set(
  Object.values(manualClients)
    .map((client) => client.taxonomyKey)
    .filter(Boolean)
);

const workbookClients = Object.fromEntries(
  Object.entries(workbookTaxonomy.clients ?? {})
    .filter(([key]) => !manualTaxonomyMappings.has(key))
    .map(([key, client]) => [
      key,
      {
        displayName: client.displayName,
        aliases: uniqueValues([client.code, client.displayName, key]),
        domains: extractDomains(client.exampleDestinations ?? []),
        taxonomyKey: key
      }
    ])
);

const clients = attachTaxonomy({
  ...workbookClients,
  ...manualClients
});

export default {
  assetTypes: ["social", "email", "pr", "offline", "paid", "owned"],
  workbookTaxonomy,
  clients,
  channels: staticChannels,
  campaignLabelAliases: {
    guide: "guide",
    flyer: "flyer",
    brochure: "brochure"
  }
};

function attachTaxonomy(clientsByKey) {
  return Object.fromEntries(
    Object.entries(clientsByKey).map(([key, client]) => {
      const taxonomy = workbookTaxonomy.clients?.[client.taxonomyKey ?? key] ?? null;
      return [key, {
        ...client,
        taxonomy: taxonomy ? {
          code: taxonomy.code,
          displayName: taxonomy.displayName,
          sources: taxonomy.sources ?? [],
          mediums: taxonomy.mediums ?? [],
          campaigns: taxonomy.campaigns ?? [],
          terms: taxonomy.terms ?? [],
          contents: taxonomy.contents ?? [],
          hashtags: taxonomy.hashtags ?? [],
          combinations: taxonomy.combinations ?? []
        } : null
      }];
    })
  );
}

function extractDomains(urls) {
  const domains = new Set();

  urls.forEach((url) => {
    try {
      domains.add(new URL(url).hostname.toLowerCase());
    } catch {
      // ignore invalid workbook examples
    }
  });

  return [...domains];
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];
}
