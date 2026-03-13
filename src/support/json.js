export function encodeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

export function decodeJson(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
