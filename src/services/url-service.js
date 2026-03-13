export class UrlService {
  normalizeDestination(url) {
    const parsed = new URL(url);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      parsed.searchParams.delete(key);
    }

    parsed.search = buildSortedSearch(parsed.searchParams);
    return parsed.toString();
  }

  appendUtms(destinationUrl, utmParams) {
    const parsed = new URL(destinationUrl);

    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      parsed.searchParams.delete(key);
    }

    for (const [key, value] of Object.entries(utmParams)) {
      if (value !== undefined && value !== null && value !== "") {
        parsed.searchParams.set(key, value);
      }
    }

    parsed.search = buildSortedSearch(parsed.searchParams);
    return parsed.toString();
  }
}

function buildSortedSearch(searchParams) {
  const entries = [...searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const keyCompare = leftKey.localeCompare(rightKey);
    return keyCompare !== 0 ? keyCompare : leftValue.localeCompare(rightValue);
  });

  return entries.length > 0 ? `?${new URLSearchParams(entries).toString()}` : "";
}
