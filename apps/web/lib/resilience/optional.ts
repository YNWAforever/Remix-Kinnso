const errorName = (error: unknown) => error instanceof Error ? error.name : 'UnknownError'

function record(module: string, error: unknown) {
  console.error('optional-module-failed', { module, errorName: errorName(error) })
}

export async function optionalQuery<T>(
  module: string,
  load: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try { return await load() } catch (error) { record(module, error); return fallback }
}

export function optionalValue<T>(module: string, build: () => T, fallback: T): T {
  try { return build() } catch (error) { record(module, error); return fallback }
}
