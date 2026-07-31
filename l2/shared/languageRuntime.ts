/// <mls fileReference="_102033_/l2/shared/languageRuntime.ts" enhancement="_blank" />

type RuntimeLanguageDocument = {
  documentElement: { lang: string };
  querySelectorAll: (selector: string) => ArrayLike<unknown> | Iterable<unknown>;
};

type RuntimeLanguageComponent = {
  requestUpdate?: () => void;
};

function normalizeLanguage(language: string): string {
  return language.trim().replace(/_/gu, '-').toLowerCase();
}

export function listRuntimeLanguages(languages: readonly string[] | undefined): string[] {
  return [...new Set((languages ?? [])
    .filter((language): language is string => typeof language === 'string')
    .map(normalizeLanguage)
    .filter(Boolean))];
}

export function resolveRuntimeLanguage(
  languages: readonly string[],
  requestedLanguage: string,
): string | undefined {
  const requested = normalizeLanguage(requestedLanguage);
  if (!requested) {
    return undefined;
  }

  const exact = languages.find((language) => normalizeLanguage(language) === requested);
  if (exact) {
    return exact;
  }

  const primary = requested.split('-')[0];
  return languages.find((language) => normalizeLanguage(language).split('-')[0] === primary);
}

export function getRuntimeLanguage(
  languages: readonly string[],
  documentLanguage: string,
): string | undefined {
  return resolveRuntimeLanguage(languages, documentLanguage)
    ?? languages[0]
    ?? (normalizeLanguage(documentLanguage) || undefined);
}

export function getNextRuntimeLanguage(
  languages: readonly string[],
  documentLanguage: string,
): string | undefined {
  if (languages.length <= 1) {
    return undefined;
  }

  const current = getRuntimeLanguage(languages, documentLanguage);
  const currentIndex = current ? languages.indexOf(current) : -1;
  return languages[(currentIndex + 1) % languages.length];
}

export function setRuntimeLanguage(
  requestedLanguage: string,
  languages: readonly string[],
  runtimeDocument: RuntimeLanguageDocument = document,
): void {
  const language = typeof requestedLanguage === 'string'
    ? resolveRuntimeLanguage(languages, requestedLanguage)
    : undefined;
  if (!language) {
    const valid = languages.length > 0 ? languages.join(', ') : 'none';
    throw new Error(`mls.sites.setLanguage("${String(requestedLanguage)}"): language not available (valid: ${valid}).`);
  }

  runtimeDocument.documentElement.lang = language;
  for (const element of Array.from(runtimeDocument.querySelectorAll('*'))) {
    const component = element as RuntimeLanguageComponent;
    if (typeof component.requestUpdate === 'function') {
      component.requestUpdate();
    }
  }
}
