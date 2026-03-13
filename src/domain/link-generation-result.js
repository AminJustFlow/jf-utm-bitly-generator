export class LinkGenerationResult {
  constructor({ fingerprint, longUrl, shortUrl, qrUrl = null, reusedExisting = false, bitlyMetadata = {} }) {
    this.fingerprint = fingerprint;
    this.longUrl = longUrl;
    this.shortUrl = shortUrl;
    this.qrUrl = qrUrl;
    this.reusedExisting = reusedExisting;
    this.bitlyMetadata = bitlyMetadata;
  }
}
