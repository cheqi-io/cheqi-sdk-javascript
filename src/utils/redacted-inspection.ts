/** Hide credentials in diagnostic strings and Node inspection, preserving wire JSON. */
export function withRedactedInspection<T extends object>(value: T, sensitiveFields: readonly string[]): T {
  const diagnostic = () => Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, sensitiveFields.includes(key) ? "<redacted>" : item]));
  Object.defineProperties(value, {
    [Symbol.for("nodejs.util.inspect.custom")]: { value: diagnostic },
    toString: { value: () => JSON.stringify(diagnostic()) }
  });
  return value;
}
