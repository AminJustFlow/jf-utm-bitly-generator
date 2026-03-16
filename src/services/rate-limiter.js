export class RateLimiter {
  constructor(requestRepository, limit, windowSeconds) {
    this.requestRepository = requestRepository;
    this.limit = limit;
    this.windowSeconds = windowSeconds;
  }

  allows(event) {
    const since = new Date(Date.now() - (this.windowSeconds * 1000)).toISOString();
    const count = this.requestRepository.countRecentByActorChannel(
      event.userId ?? "anonymous",
      event.channelId,
      since
    );

    return count < this.limit;
  }
}
