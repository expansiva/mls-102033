/// <mls fileReference="_102033_/l2/shared/shell.defs.ts" enhancement="_blank" />
export const skill = {
  componentId: 'collab-aura-shell',
  purpose: 'Render the frontend shell, expose header/aside/content regions, and mount module-owned region renderers.',
  responsibilities: [
    'Read the boot config injected by the server runtime.',
    'Resolve the active device from the viewport and module preferences.',
    'Render the shell layout and region visibility state.',
    'Control the aside mode as inline, drawer, or fullscreen.',
    'Load the module renderers for header, aside, and content.',
    'Apply Aura fallback renderers when a module does not define header or aside.',
    'Mount the active renderer into each region host.',
  ],
  regions: ['header', 'aside', 'content'],
  supportedDevices: ['desktop', 'mobile'],
  supportedShellModes: ['spa', 'pwa'],
} as const;
