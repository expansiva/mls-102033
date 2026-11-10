/// <mls fileReference="_102033_/l2/shared/nav3ActiveTab.ts" enhancement="_blank" />
// Which element the nav3 tab on screen hosts, and when that changes.
//
// The content region shows the boot module in the `app` tab and other modules (moduleTab) or services in their own
// tabs, each a sibling panel. Whoever works on "the page on screen" — the Studio edit tools, through serviceClientApp —
// needs the host of the ACTIVE tab, not the app's: the app panel is display:none while another tab is on screen.

/** Fired on window by the shell after a render that changed the tab on screen or the element it hosts. */
export const NAV3_TAB_CHANGE_EVENT = 'collab-nav3-tab-change';

export interface INav3TabChange {
  id: string;
}

/**
 * The element hosted by the tab `activeId`: the app region host for `app`, the element given to `openTab` otherwise.
 * Null when that tab is not there (closed, or the app host not rendered — a blocking error replaces it).
 */
export function activeTabHost<T>(activeId: string, appHost: T | null, tabs: ReadonlyArray<{ id: string; element: T }>): T | null {
  if (activeId === 'app') return appHost;
  return tabs.find(tab => tab.id === activeId)?.element ?? null;
}

/** What was last announced; the shell compares the current one against it after every render. */
export interface IAnnouncedTab<T> {
  id: string;
  element: T | null;
}

/** True when the tab on screen, or the element it hosts (a pinned tab renumbered, a host re-created), changed. */
export function tabChanged<T>(previous: IAnnouncedTab<T> | null, next: IAnnouncedTab<T>): boolean {
  return !previous || previous.id !== next.id || previous.element !== next.element;
}
