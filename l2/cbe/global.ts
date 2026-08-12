declare global {
  export interface Window {
    mls?: {
      api: { cbeLogin: () => Promise<{ statusCode: number } | undefined> };
      actualProject?: number;
      setActualProject?: (project?: number) => void;
      baseMonaco?: string;
      editor: { InitMonaco: () => Promise<void> };
      stor: {
        orgs: Record<string, unknown>;
        files: Record<string, unknown>;
        localDB: { getAllKeys: () => Promise<string[]> };
        cache: { installIfNeeded: () => Promise<unknown> };
        server: { loadProjectInfoIfNeeded: (project: number, forceUpdate?: boolean) => Promise<boolean> };
        loadProjectdependenciesInfoIfNeed: (project: number, forceUpdate?: boolean) => Promise<number[]>;
      };
    },
    latest?: { www?: string; libs?: string; monaco?: string; indexHTML?: string; l7?: string };
    monacoReady?: Promise<void>;
  }
}

export interface StudioMls {
  baseMonaco?: string;
  editor: { InitMonaco: () => Promise<void> };
}
