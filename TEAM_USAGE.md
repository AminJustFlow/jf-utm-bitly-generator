# Team Usage

## What the Bot Does

Post a request in `#jf-link-generator` and the bot will:

- understand the client, channel, and destination URL
- create the canonical UTM campaign name
- generate the full tracked URL
- shorten it
- generate a QR code URL when needed
- reuse an existing short link when the same request already exists

## What Requests It Understands

- natural language requests
- short direct requests
- QR and flyer requests
- strict fallback commands

## 10 Example Requests

1. `Need an Instagram link for Studleys spring sale to https://studleys.com/perennials`
2. `Create a QR link for GAS guide flyer to https://guardianangelseniorservices.com/guide`
3. `Woodstone LinkedIn post for open house to https://woodstonehomesnh.com/open-house`
4. `Need a Facebook link for Studleys mulch promo to https://studleys.com/mulch`
5. `Serenity email link for April newsletter to https://example.com/newsletter`
6. `JF PR link for awards release to https://justflowmarketing.com/awards`
7. `Create a google ads link for Studleys spring cleanup to https://studleys.com/cleanup`
8. `Need a QR code for GAS brochure to https://guardianangelseniorservices.com/services`
9. `Woodstone instagram reel for model home to https://woodstonehomesnh.com/model-home`
10. `link | client=studleys | channel=instagram | campaign=spring-sale | url=https://studleys.com/perennials`

## If the Bot Asks for Clarification

That means it found part of the request but not enough to safely create the final link.

Common reasons:

- missing channel
- missing client
- missing URL
- vague request wording

Best response style:

- reply with just the missing detail
- example: `instagram`
- example: `client=gas`
- example: `https://guardianangelseniorservices.com/guide`

## What Not to Type

- multiple link requests in one message
- vague directions without a URL
- long internal discussions
- pasted spreadsheets
- campaign planning notes that do not actually request a link

## How Duplicate Links Are Handled

If the same normalized request already exists, the bot reuses the current short link instead of creating a new one.

You will see:

`An existing matching link was found, so I reused the current short link.`
