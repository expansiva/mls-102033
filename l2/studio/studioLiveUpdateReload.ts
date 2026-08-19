/// <mls fileReference="_102033_/l2/studio/studioLiveUpdateReload.ts" enhancement="_blank" />
// Live-update mode: reload the page.
//
// The blunt but FAITHFUL mode — the app comes back evaluating everything from scratch, so a deleted
// member is really gone, `static styles` is rebuilt and constructors run fresh. That is what the
// hotSwap mode cannot promise, which makes this the honest choice for a structural rewrite (an agent
// redoing the page) and the fallback whenever hotSwap misbehaves.
//
// COSTS, stated plainly: the screen loses its state (open dialogs, scroll, unsent input), and the
// edit only comes back if the service worker serves the page module from the compiled-from-source
// cache instead of the dist chunk — the premise of this task, and the one thing still pending
// verification on the VM (fase 1). If that premise does not hold, this mode shows the OLD text.

import type { ILiveUpdateContext, ILiveUpdateMode, ILiveUpdateResult } from '/_102033_/l2/studio/studioLiveUpdate.js';

// Long enough for the editor to paint its status strip before the page goes away — a reload with no
// visible cause reads as a crash.
const RELOAD_DELAY_MS = 600;

export const reloadMode: ILiveUpdateMode = {
  name: 'reload',
  description: 'recarrega a página (fiel, mas perde o estado da tela)',

  async apply(_ctx: ILiveUpdateContext): Promise<ILiveUpdateResult> {
    window.setTimeout(() => {
      location.reload();
    }, RELOAD_DELAY_MS);
    return { ok: true, message: 'recarregando para aplicar...' };
  },
};
