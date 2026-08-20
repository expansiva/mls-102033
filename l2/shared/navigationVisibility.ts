/// <mls fileReference="_102033_/l2/shared/navigationVisibility.ts" enhancement="_blank" />
// Which menu items a user may see. Kept OUT of the component on purpose: it is pure logic about
// authorities, and importing the Lit component to test it drags a DOM in for nothing.

/**
 * The items this user may see: `item.actors` ∩ the user's authorities of THIS module.
 *
 * Pure and conservative. With no authorities known — which is every session until the token issuer starts
 * emitting them — NOTHING is filtered: a menu that empties itself the moment a lookup fails would be a
 * worse failure than an unfiltered one. An item that declares no `actors` is for everybody either way.
 */
export function visibleNavigation<T>(
  navigation: readonly T[],
  authorities: readonly string[],
  moduleId: string,
): T[] {
  const prefix = moduleId ? `${moduleId}:` : '';
  const actors = new Set(
    authorities
      .filter(value => !prefix || value.startsWith(prefix))
      .map(value => (prefix ? value.slice(prefix.length) : value.split(':').pop() ?? value)),
  );
  if (actors.size === 0) return [...navigation];
  return navigation.filter(item => {
    const raw = (item as { actors?: unknown }).actors;
    const declared = Array.isArray(raw) ? raw.filter((value): value is string => typeof value === 'string') : [];
    return declared.length === 0 || declared.some(actor => actors.has(actor));
  });
}
