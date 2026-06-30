/// <mls fileReference="_102033_/l2/shellEvents.ts" enhancement="_blank" />
export const AURA_TOGGLE_ASIDE_EVENT = 'collab-aura:toggle-aside';
export const AURA_OPEN_ASIDE_EVENT = 'collab-aura:open-aside';
export const AURA_CLOSE_ASIDE_EVENT = 'collab-aura:close-aside';

function dispatchAuraShellEvent(eventName: string) {
  window.dispatchEvent(new CustomEvent(eventName));
}

export function toggleAuraAside() {
  if (window.collabMasterFrontendShellControls) {
    window.collabMasterFrontendShellControls.toggleAside();
    return;
  }
  dispatchAuraShellEvent(AURA_TOGGLE_ASIDE_EVENT);
}

export function openAuraAside() {
  if (window.collabMasterFrontendShellControls) {
    window.collabMasterFrontendShellControls.openAside();
    return;
  }
  dispatchAuraShellEvent(AURA_OPEN_ASIDE_EVENT);
}

export function closeAuraAside() {
  if (window.collabMasterFrontendShellControls) {
    window.collabMasterFrontendShellControls.closeAside();
    return;
  }
  dispatchAuraShellEvent(AURA_CLOSE_ASIDE_EVENT);
}
