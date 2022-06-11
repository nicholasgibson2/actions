/* eslint @typescript-eslint/explicit-module-boundary-types: 0 */
export function invariant(
  condition: unknown,
  message?: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function parseUndefined(input: string): string | undefined {
  return input === undefined || input === '' ? undefined : input;
}
export function parseNumber(input: string): number | undefined {
  return parseUndefined(input) ? Number(input) : undefined;
}
