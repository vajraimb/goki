/** Resolve extensionless relative imports to .ts for Node strip-types. */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[A-Za-z0-9]+$/.test(specifier)
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      try {
        return await nextResolve(`${specifier}.tsx`, context);
      } catch {
        return nextResolve(specifier, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
