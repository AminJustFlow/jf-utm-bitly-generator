export class EngagedSessionService {
  isEngaged(session, eventSummary = {}) {
    return truthy(session.is_engaged)
      || Number(session.pageviews ?? 0) >= 2
      || Number(session.engagement_seconds ?? 0) >= 30
      || truthy(eventSummary.hasNonPageViewEvent);
  }

  engagementRate(engagedSessions, sessions) {
    const sessionCount = Number(sessions ?? 0);
    if (sessionCount <= 0) {
      return 0;
    }

    const rate = (Number(engagedSessions ?? 0) / sessionCount) * 100;
    return Number(rate.toFixed(1));
  }
}

function truthy(value) {
  return value === true || value === 1 || value === "1";
}
