/// <mls fileReference="_102033_/l2/cbe/studioDevice.ts" enhancement="_blank" />
// Which page variant (web/desktop or web/mobile) the studio shows, apart from the screen width.
//
// Outside the studio the width decides the device, and that one value drives BOTH the page variant
// and the layout around it (spliter, aside, top band). While editing, the person picks the variant
// instead — but only the PAGE follows the pick: forcing the layout to mobile would fold the studio's
// own split into one pane. So the shell keeps two answers: the layout device (always the width) and
// the content device (this pick, while studio mode is on).
//
// The pick is remembered on its own key, so a reload in studio mode (or the next session) comes back
// to it. Leaving studio mode drops it and the width decides again.

export type StudioDevice = 'desktop' | 'mobile';

export interface IDeviceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STUDIO_DEVICE_KEY = 'collab_studio_device';

function defaultStorage(): IDeviceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // storage blocked: the pick lasts the session
  }
}

export function isStudioDevice(value: unknown): value is StudioDevice {
  return value === 'desktop' || value === 'mobile';
}

/** The remembered pick, or null when the person never chose. */
export function readStudioDevice(storage: IDeviceStorage | null = defaultStorage()): StudioDevice | null {
  try {
    const value = storage?.getItem(STUDIO_DEVICE_KEY);
    return isStudioDevice(value) ? value : null;
  } catch {
    return null;
  }
}

export function rememberStudioDevice(device: StudioDevice, storage: IDeviceStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(STUDIO_DEVICE_KEY, device);
  } catch { /* storage blocked: the pick lasts the session */ }
}

/** The variant to mount: the studio pick while there is one, the width otherwise. */
export function contentDevice(pick: StudioDevice | null, widthDevice: StudioDevice): StudioDevice {
  return pick ?? widthDevice;
}
