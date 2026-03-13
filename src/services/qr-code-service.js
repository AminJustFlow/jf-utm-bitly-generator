export class QrCodeService {
  constructor(config) {
    this.config = config;
  }

  generateUrl(targetUrl) {
    const url = new URL(this.config.baseUrl);
    url.searchParams.set("size", this.config.size);
    url.searchParams.set("data", targetUrl);
    return url.toString();
  }
}
