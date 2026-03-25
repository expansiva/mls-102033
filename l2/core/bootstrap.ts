/// <mls fileReference="_102033_/l2/core/bootstrap.ts" enhancement="_blank" />
export interface CollabNavigationItem {
  label: string;
  href: string;
}

export interface CollabPageDefinition {
  path: string;
  title: string;
  tagName: string;
  loader: () => Promise<unknown>;
}

export interface CollabAppDefinition {
  projectId: string;
  appId: string;
  title: string;
  shellMode: 'spa' | 'pwa';
  pages: CollabPageDefinition[];
  navigation: CollabNavigationItem[];
}

export async function bootstrapCollabApp(_app: CollabAppDefinition) {
  await import('/_102033_/l2/shared/bootstrap.js');
}
