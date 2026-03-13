export class LinkGenerationResult {
  constructor({
    fingerprint,
    longUrl,
    shortUrl = null,
    qrUrl = null,
    reusedExisting = false,
    bitlyMetadata = {},
    shortLinkAvailable = true
  }) {
    this.fingerprint = fingerprint;
    this.longUrl = longUrl;
    this.shortUrl = shortUrl;
    this.qrUrl = qrUrl;
    this.reusedExisting = reusedExisting;
    this.bitlyMetadata = bitlyMetadata;
    this.shortLinkAvailable = shortLinkAvailable;
  }
}
