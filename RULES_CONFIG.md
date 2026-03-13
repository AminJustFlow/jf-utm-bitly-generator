# Rules Config

The deterministic tracking rules for the Node app live in [`config/rules.js`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/config/rules.js).

## Current Concepts

- clients
- channels
- asset types
- aliases
- source and medium mapping
- campaign naming policy

## Add a New Client

Edit [`config/rules.js`](/c:/Users/AminHcinet/Documents/jf-utm-bitly-generator/ndoejsapp/config/rules.js) and add:

```js
newclient: {
  displayName: "New Client",
  aliases: ["new client", "nc"],
  domains: ["newclient.com"]
}
```

## Add a New Channel

Add:

```js
podcast: {
  displayName: "Podcast",
  aliases: ["podcast"],
  source: "podcast",
  medium: "audio",
  assetType: "offline",
  requiresQr: false
}
```

## Campaign Naming Policy

The final campaign is generated in Node, not by the model.

Format:

```text
{client}_{yyyy_mm}_{slugified_campaign_label}
```

Examples:

- `studleys_2026_03_spring_sale`
- `woodstone_2026_03_open_house`

Fallback when no campaign label is present:

```text
{client}_{yyyy_mm}_{channel}
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
- you want additional UTM fields
- you need channel-specific validation beyond basic config

## After Updating Rules

Run:

```bash
node ./tests/run.js
```

Then send one real ClickUp test message before opening the bot to the full team.
