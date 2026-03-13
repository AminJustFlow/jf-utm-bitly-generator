# Rules Config

The deterministic tracking rules for the Node app live in [`config/rules.js`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/config/rules.js).

## Current Concepts

- clients
- channels
- asset types
- aliases
- five-field UTM defaults
- per-client and per-channel overrides

## Add a New Client

Edit [`config/rules.js`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/config/rules.js) and add:

```js
newclient: {
  displayName: "New Client",
  aliases: ["new client", "nc"],
  domains: ["newclient.com"],
  utmDefaults: {
    website: {
      source: "Website",
      medium: "Website",
      campaign: "Website",
      term: "",
      content: ""
    }
  }
}
```

## Add a New Channel

Add:

```js
podcast: {
  displayName: "Podcast",
  aliases: ["podcast"],
  assetType: "offline",
  requiresQr: false,
  utmDefaults: {
    source: "Podcast",
    medium: "Audio",
    campaign: null,
    term: "",
    content: ""
  }
}
```

## UTM Resolution Policy

The final UTM set is resolved in Node, not by the model.

Precedence for each field:

```text
explicit request override
-> client/channel defaults
-> channel defaults
-> generated fallback
```

Current fields:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`

Campaign fallback when nothing explicit or configured is provided:

```text
slugified campaign label
or channel name when no label exists
```

## When to Change Code Instead of Config

Change config when:

- adding clients
- adding aliases
- adding channels
- changing source/medium mappings

Change code when:

- ClickUp payload shape changes
- duplicate logic changes
- you want non-standard UTM inference logic
- you need channel-specific validation beyond basic config

## After Updating Rules

Run:

```bash
node ./tests/run.js
```

Then send one real ClickUp test message before opening the bot to the full team.
