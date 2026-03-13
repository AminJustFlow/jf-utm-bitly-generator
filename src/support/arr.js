export function get(object, path, defaultValue = null) {
  const segments = path.split(".");
  let value = object;

  for (const segment of segments) {
    if (value === null || value === undefined) {
      return defaultValue;
    }

    if (Array.isArray(value) && /^\d+$/u.test(segment)) {
      const index = Number(segment);
      value = value[index];
      continue;
    }

    if (typeof value === "object" && segment in value) {
      value = value[segment];
      continue;
    }

    return defaultValue;
  }

  return value ?? defaultValue;
}
