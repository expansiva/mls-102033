/// <mls fileReference="_102033_/l2/cbe/reportBug/reportBug.ts" enhancement="_blank" />
// The bug report panel, opened in a nav3 content tab by serviceClientApp's menu ("Reportar bug") or by
// Ctrl+Shift+B (ported from _100554_/l2/serviceReportBug, which hosted it as a studio service).
//
// Two modes, two tabs: `capture` (describe + send the snapshot just taken) and `view` (a bug received
// in the chat, read-only). Separate tabs so opening someone's bug does not wipe the draft being written.

import '/_102029_/l2/contracts/bootstrap.js';
import { html, LitElement, type TemplateResult } from 'lit';
import {
  getLastSnapshot,
  buildBugMessage,
  parseBugView,
  captureAndOpenReportBug,
  REPORT_TAB_ID,
  REPORT_VIEW_TAB_ID,
  type IBootSnapshot,
  type IBugSnapshot,
  type IBugView,
  type IConsoleEntry,
  type IMlsSnapshot,
  type INetworkEntry,
} from '/_102033_/l2/cbe/reportBug/reportBugCore.js';

/// **collab_i18n_start**
const message_pt = {
  tabTitle: 'Reportar bug',
  viewTabTitle: 'Bug recebido',
  emptyHintBefore: 'Aperte Ctrl+Shift+B na tela onde o problema aconteceu, ou',
  captureHere: 'aperte aqui',
  emptyHintAfter: ', para capturar o estado e o print.',
  description: 'O que você tentou fazer quando o erro aconteceu?',
  descriptionPlaceholder: 'Descreva os passos que levaram ao erro...',
  sendTo: 'Enviar para',
  selectDestination: 'Selecione a pessoa ou sala...',
  noThreads: 'Nenhuma conversa encontrada — abra as mensagens ao menos uma vez.',
  noMatches: 'Nenhuma conversa corresponde ao filtro.',
  send: 'Enviar bug',
  sending: 'Enviando...',
  sent: 'Bug enviado — o JSON completo também está no console do navegador.',
  sendFailed: 'Falha ao enviar',
  viewTitle: 'Visualização de bug (somente leitura)',
  viewInvalid: 'Não foi possível ler o JSON do bug.',
  viewScreenshotUnavailable: 'Print não incluído na mensagem (ver console.log de quem reportou).',
  screenshot: 'Print da tela',
  noScreenshot: 'Print não capturado (permissão negada ou não suportado).',
  context: 'Contexto (mls)',
  bootContext: 'Contexto do boot (servidor)',
  notDefined: 'não definido',
  network: 'Últimas requisições',
  console: 'Mensagens do console',
  capturedAt: 'Capturado em',
  user: 'Usuário',
  colField: 'Campo',
  colValue: 'Valor',
  colMethod: 'Método',
  colRequest: 'Requisição',
  colStatus: 'Status',
  colTime: 'Tempo',
  colWhen: 'Hora',
  colType: 'Tipo',
  colMessage: 'Mensagem',
};

type MessageType = typeof message_pt;

const message_en: MessageType = {
  tabTitle: 'Report bug',
  viewTabTitle: 'Received bug',
  emptyHintBefore: 'Press Ctrl+Shift+B on the screen where the problem happened, or',
  captureHere: 'click here',
  emptyHintAfter: ', to capture the state and screenshot.',
  description: 'What were you trying to do when the error happened?',
  descriptionPlaceholder: 'Describe the steps that led to the error...',
  sendTo: 'Send to',
  selectDestination: 'Select the person or room...',
  noThreads: 'No conversations found — open the messages at least once.',
  noMatches: 'No conversation matches the filter.',
  send: 'Send bug',
  sending: 'Sending...',
  sent: 'Bug sent — the full JSON is also in the browser console.',
  sendFailed: 'Failed to send',
  viewTitle: 'Bug view (read-only)',
  viewInvalid: 'Could not parse the bug JSON.',
  viewScreenshotUnavailable: 'Screenshot not included in the message (see the reporter\'s console.log).',
  screenshot: 'Screenshot',
  noScreenshot: 'Screenshot not captured (permission denied or not supported).',
  context: 'Context (mls)',
  bootContext: 'Boot context (server)',
  notDefined: 'not defined',
  network: 'Last requests',
  console: 'Console messages',
  capturedAt: 'Captured at',
  user: 'User',
  colField: 'Field',
  colValue: 'Value',
  colMethod: 'Method',
  colRequest: 'Request',
  colStatus: 'Status',
  colTime: 'Time',
  colWhen: 'When',
  colType: 'Type',
  colMessage: 'Message',
};
/// **collab_i18n_end**

function messagesFor(language: string): MessageType {
  return language.toLowerCase().startsWith('pt') ? message_pt : message_en;
}

function pageMessages(): MessageType {
  return messagesFor(document.documentElement?.lang || 'en');
}

// ---------------------------------------------------------------------------
// Destinations and send (collab messages) — loaded on demand.
// ---------------------------------------------------------------------------

interface IDestination { threadId: string; name: string; group: string }

/** Sending needs the runtime messages environment even if the messages pane was never opened. */
async function ensureMessagesEnvironment(): Promise<void> {
  const { ensureRuntimeMessagesEnvironment } = await import('/_102033_/l2/cbe/runtimeMessagesEnvironment.js');
  ensureRuntimeMessagesEnvironment();
}

async function loadDestinations(): Promise<IDestination[]> {
  try {
    await ensureMessagesEnvironment();
    const idb = await import('/_102025_/l2/collabMessagesIndexedDB.js');
    const threads: any[] = await idb.getAllThreads();
    const rank = (name: string) => name.startsWith('@') ? 0 : name.startsWith('#') ? 1 : 2;
    return threads
      .filter((t) => t.status === 'active')
      .map((t) => ({ threadId: t.threadId, name: t.name, group: t.group }))
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  } catch (error) {
    console.warn('[reportBug] destinations unavailable', error);
    return [];
  }
}

async function sendToThread(threadId: string, content: string): Promise<void> {
  await ensureMessagesEnvironment();
  const helper = await import('/_102025_/l2/collabMessagesHelper.js');
  await helper.addMessage(threadId, content);
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export type ReportBugMode = 'capture' | 'view';

/**
 * Opens (or replaces) the report tab next to the app tab.
 *
 * The app's tabs live adopted inside serviceClientApp; if another right-side service is in front the
 * tab would open hidden behind it, so the app service is brought back first.
 */
export async function openReportBugTab(mode: ReportBugMode, json = ''): Promise<void> {
  const nav = window.collabRuntimeNav3;
  if (!nav) {
    console.warn('[reportBug] collabRuntimeNav3 is not available; the report cannot open in a tab');
    return;
  }
  const { ensureAppServiceVisible } = await import('/_102033_/l2/cbe/runtimeMessagesEnvironment.js');
  ensureAppServiceVisible();
  const msg = pageMessages();
  const panel = document.createElement(REPORT_BUG_TAG) as ReportBug;
  if (mode === 'view') {
    panel.viewData = parseBugView(json);
    panel.viewError = !panel.viewData;
  } else {
    panel.snapshot = getLastSnapshot();
  }
  const id = mode === 'view' ? REPORT_VIEW_TAB_ID : REPORT_TAB_ID;
  nav.openTab({ id, title: mode === 'view' ? msg.viewTabTitle : msg.tabTitle, element: panel, closable: true });
  nav.activateTab(id);
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export const REPORT_BUG_TAG = 'cbe--report-bug-102033';

export class ReportBug extends LitElement {
  static properties = {
    snapshot: { attribute: false },
    viewData: { attribute: false },
    viewError: { attribute: false },
    description: { state: true },
    sent: { state: true },
    sending: { state: true },
    sendError: { state: true },
    destinations: { state: true },
    selectedThreadId: { state: true },
    destinationFilter: { state: true },
    showSuggestions: { state: true },
    highlightedIndex: { state: true },
  };

  declare snapshot: IBugSnapshot | undefined;
  declare viewData: IBugView | undefined;
  declare viewError: boolean;
  declare description: string;
  declare sent: boolean;
  declare sending: boolean;
  declare sendError: string;
  declare destinations: IDestination[];
  declare selectedThreadId: string;
  declare destinationFilter: string;
  declare showSuggestions: boolean;
  declare highlightedIndex: number;

  private msg: MessageType = message_en;

  constructor() {
    super();
    this.viewError = false;
    this.description = '';
    this.sent = false;
    this.sending = false;
    this.sendError = '';
    this.destinations = [];
    this.selectedThreadId = '';
    this.destinationFilter = '';
    this.showSuggestions = false;
    this.highlightedIndex = -1;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Fills the nav3 tab panel and scrolls inside it.
    this.style.display = 'block';
    this.style.height = '100%';
    this.style.overflow = 'auto';
    if (!this.viewData && this.snapshot) void this.refreshDestinations();
  }

  private async refreshDestinations() {
    const destinations = await loadDestinations();
    this.destinations = destinations;
    if (this.selectedThreadId && !destinations.some((d) => d.threadId === this.selectedThreadId)) {
      this.selectedThreadId = '';
      this.destinationFilter = '';
    }
  }

  private get filteredDestinations(): IDestination[] {
    const filter = this.destinationFilter.trim().toLowerCase();
    if (!filter) return this.destinations;
    return this.destinations.filter((d) => d.name.toLowerCase().includes(filter));
  }

  private selectDestination(d: IDestination) {
    this.selectedThreadId = d.threadId;
    this.destinationFilter = d.name;
    this.showSuggestions = false;
    this.highlightedIndex = -1;
  }

  private onFilterInput(e: Event) {
    this.destinationFilter = (e.target as HTMLInputElement).value;
    this.selectedThreadId = '';
    this.showSuggestions = true;
    this.highlightedIndex = -1;
  }

  private onFilterBlur() {
    // Delay so a click on a suggestion lands before the list closes.
    setTimeout(() => { this.showSuggestions = false; this.highlightedIndex = -1; }, 150);
  }

  private onFilterKeyDown(e: KeyboardEvent) {
    const items = this.filteredDestinations;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.showSuggestions = true;
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
    } else if (e.key === 'Enter') {
      if (this.showSuggestions && this.highlightedIndex >= 0 && items[this.highlightedIndex]) {
        e.preventDefault();
        this.selectDestination(items[this.highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      this.showSuggestions = false;
      this.highlightedIndex = -1;
    }
  }

  private async onSend() {
    if (!this.snapshot || !this.selectedThreadId || this.sending) return;
    const payload: IBugView = { description: this.description, ...this.snapshot };
    // Full payload (screenshot and whole console included) stays available in the browser console.
    console.log('[reportBug] payload:', payload);
    this.sending = true;
    this.sendError = '';
    try {
      await sendToThread(this.selectedThreadId, buildBugMessage(payload));
      this.sent = true;
      // Sent: the report is done, the tab goes away. A failure keeps it open with the error.
      window.collabRuntimeNav3?.closeTab(REPORT_TAB_ID);
    } catch (err: any) {
      this.sendError = err?.message || String(err);
    } finally {
      this.sending = false;
    }
  }

  private renderEmpty() {
    return html`
      <div class="rb-empty">
        ${this.msg.emptyHintBefore}
        <button class="rb-capture-link" @click=${() => captureAndOpenReportBug()}>${this.msg.captureHere}</button>${this.msg.emptyHintAfter}
      </div>
    `;
  }

  private renderMlsContext(m: IMlsSnapshot) {
    const rows: Array<[string, string]> = [
      ['actualProject', String(m.actualProject ?? '-')],
      ['actualLevel', String(m.actualLevel ?? '-')],
      ['actualService', m.actualService || '-'],
      ['actualPosition', m.actualPosition || '-'],
      ['actualModule', m.actualModule || '-'],
    ];
    return html`
      <table class="rb-table">
        <thead>
          <tr><th>${this.msg.colField}</th><th>${this.msg.colValue}</th></tr>
        </thead>
        <tbody>
          ${rows.map(([k, v]) => html`<tr><td>${k}</td><td>${v}</td></tr>`)}
          ${m.actual.filter((a) => a.project || a.left || a.right).map((a) => html`
            <tr>
              <td>actual[${a.level}]</td>
              <td>prj ${a.project ?? '-'}${a.left?.shortName ? ` | L: ${a.left.shortName}` : ''}${a.right?.shortName ? ` | R: ${a.right.shortName}` : ''}</td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }

  private renderBootContext(b: IBootSnapshot | undefined) {
    const items: Array<[string, unknown]> = [
      ['window.collabBoot', b?.collabBoot],
      ['window.collabFecho', b?.collabFecho],
    ];
    return html`
      ${items.map(([name, value]) => value === undefined
        ? html`<div class="rb-boot-item"><span class="rb-boot-name">${name}</span>: <span class="rb-boot-undefined">${this.msg.notDefined}</span></div>`
        : html`
          <details class="rb-boot-item">
            <summary class="rb-boot-name">${name}</summary>
            <pre class="rb-boot-json">${JSON.stringify(value, null, 2)}</pre>
          </details>
        `)}
    `;
  }

  private renderNetwork(entries: INetworkEntry[]) {
    return html`
      <table class="rb-table">
        <thead>
          <tr>
            <th>${this.msg.colRequest}</th>
            <th>${this.msg.colStatus}</th>
            <th>${this.msg.colTime}</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((n) => html`
            <tr class="${(typeof n.status === 'number' && n.status >= 400) || n.status === 'failed' ? 'rb-error' : ''}">
              <td class="rb-url" title="${n.url}">${n.url}</td>
              <td>${n.status}</td>
              <td>${n.durationMs}ms</td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }

  private renderConsole(entries: IConsoleEntry[]) {
    return html`
      <div class="rb-console">
        <div class="rb-console-header">
          <span class="rb-col-when">${this.msg.colWhen}</span>
          <span class="rb-col-type">${this.msg.colType}</span>
          <span>${this.msg.colMessage}</span>
        </div>
        ${entries.map((c) => html`
          <div class="rb-line rb-${c.level}">
            <span class="rb-col-when">${c.ts.slice(11, 19)}</span>
            <span class="rb-col-type">${c.level}</span>
            <span class="rb-col-text">${c.text}</span>
          </div>
        `)}
      </div>
    `;
  }

  private renderDataSections(s: IBugSnapshot) {
    return html`
      <div class="rb-section">
        <h4>${this.msg.screenshot}</h4>
        ${s.screenshot && s.screenshot.startsWith('data:image')
          ? html`<img class="rb-screenshot" src="${s.screenshot}" alt="screenshot" />`
          : html`<div class="rb-empty">${s.screenshot ? this.msg.viewScreenshotUnavailable : this.msg.noScreenshot}</div>`}
      </div>

      <div class="rb-section">
        <h4>${this.msg.context}</h4>
        ${this.renderMlsContext(s.mls)}
      </div>

      <div class="rb-section">
        <h4>${this.msg.bootContext}</h4>
        ${this.renderBootContext(s.boot)}
      </div>

      <div class="rb-section">
        <h4>${this.msg.network} (${s.network.length})</h4>
        ${this.renderNetwork(s.network)}
      </div>

      <div class="rb-section">
        <h4>${this.msg.console} (${s.console.length})</h4>
        ${this.renderConsole(s.console)}
      </div>
    `;
  }

  private renderView(s: IBugView) {
    return html`
      <div class="rb-view-banner">${this.msg.viewTitle}</div>
      <div class="rb-meta">${this.msg.capturedAt}: ${s.capturedAt} — ${this.msg.user}: ${s.user}</div>

      <div class="rb-section">
        <label class="rb-label">${this.msg.description}</label>
        <div class="rb-view-description">${s.description || '-'}</div>
      </div>

      ${this.renderDataSections(s)}
    `;
  }

  private renderSnapshot(s: IBugSnapshot) {
    return html`
      <div class="rb-meta">${this.msg.capturedAt}: ${s.capturedAt} — ${this.msg.user}: ${s.user}</div>

      <div class="rb-section">
        <label class="rb-label">${this.msg.description}</label>
        <textarea class="rb-description" rows="4" placeholder="${this.msg.descriptionPlaceholder}"
          .value=${this.description}
          @input=${(e: Event) => { this.description = (e.target as HTMLTextAreaElement).value; }}></textarea>

        <label class="rb-label">${this.msg.sendTo}</label>
        ${this.destinations.length === 0
          ? html`<div class="rb-empty">${this.msg.noThreads}</div>`
          : html`
            <div class="rb-filter-select">
              <input class="rb-select" type="text" autocomplete="off"
                placeholder="${this.msg.selectDestination}"
                .value=${this.destinationFilter}
                @input=${(e: Event) => this.onFilterInput(e)}
                @focus=${() => { this.showSuggestions = true; }}
                @blur=${() => this.onFilterBlur()}
                @keydown=${(e: KeyboardEvent) => this.onFilterKeyDown(e)} />
              ${this.showSuggestions ? html`
                <div class="rb-suggestions">
                  ${this.filteredDestinations.length === 0
                    ? html`<div class="rb-suggestion rb-suggestion-empty">${this.msg.noMatches}</div>`
                    : this.filteredDestinations.map((d, index) => html`
                      <div class="rb-suggestion ${index === this.highlightedIndex ? 'highlighted' : ''} ${d.threadId === this.selectedThreadId ? 'selected' : ''}"
                        @mousedown=${(e: MouseEvent) => e.preventDefault()}
                        @click=${() => this.selectDestination(d)}>
                        ${d.name} <span class="rb-suggestion-group">(${d.group})</span>
                      </div>
                    `)}
                </div>
              ` : ''}
            </div>`}

        <button class="rb-send"
          ?disabled=${this.sent || this.sending || !this.description.trim() || !this.selectedThreadId}
          @click=${() => this.onSend()}>${this.sending ? this.msg.sending : this.msg.send}</button>
        ${this.sent ? html`<div class="rb-sent">${this.msg.sent}</div>` : ''}
        ${this.sendError ? html`<div class="rb-send-error">${this.msg.sendFailed}: ${this.sendError}</div>` : ''}
      </div>

      ${this.renderDataSections(s)}
    `;
  }

  private renderBody(): TemplateResult {
    if (this.viewData) return this.renderView(this.viewData);
    if (this.viewError) return html`<div class="rb-send-error">${this.msg.viewInvalid}</div>`;
    return this.snapshot ? this.renderSnapshot(this.snapshot) : this.renderEmpty();
  }

  render() {
    this.msg = pageMessages();
    return html`${styles}<div class="rb-root">${this.renderBody()}</div>`;
  }
}

// Light DOM: the rules are scoped by the tag (same approach as the shell's own <style>).
const styles = html`<style>
  cbe--report-bug-102033 {
    box-sizing: border-box;
    padding: 16px;
    font-family: inherit;
    font-size: 14px;
    color: #1f2933;
    background: #ffffff;
  }
  cbe--report-bug-102033 .rb-root { display: flex; flex-direction: column; gap: 16px; }
  cbe--report-bug-102033 .rb-section {
    display: flex; flex-direction: column; gap: 8px;
    padding: 16px; background: #f7f8fa; border: 1px solid #e4e7eb; border-radius: 4px;
  }
  cbe--report-bug-102033 h4 {
    margin: 0; padding-bottom: 8px; font-size: 14px; font-weight: 700; color: #102a43;
    border-bottom: 1px solid #cbd2d9;
  }
  cbe--report-bug-102033 .rb-meta { font-size: 12px; color: #7b8794; }
  cbe--report-bug-102033 .rb-empty { padding: 16px 8px; color: #7b8794; }
  cbe--report-bug-102033 .rb-capture-link {
    padding: 0; font: inherit; color: #2563eb; text-decoration: underline;
    background: none; border: none; cursor: pointer;
  }
  cbe--report-bug-102033 .rb-label { font-weight: 700; color: #102a43; }
  cbe--report-bug-102033 .rb-description,
  cbe--report-bug-102033 .rb-select {
    width: 100%; box-sizing: border-box; padding: 8px; font: inherit; color: inherit;
    background: #ffffff; border: 1px solid #cbd2d9; border-radius: 4px;
  }
  cbe--report-bug-102033 .rb-description { resize: vertical; }
  cbe--report-bug-102033 .rb-description:focus,
  cbe--report-bug-102033 .rb-select:focus { outline: none; border-color: #2563eb; }
  cbe--report-bug-102033 .rb-view-banner {
    padding: 8px 16px; font-size: 12px; font-weight: 700; color: #ffffff;
    background: #2563eb; border-radius: 4px;
  }
  cbe--report-bug-102033 .rb-view-description { white-space: pre-wrap; word-break: break-word; }
  cbe--report-bug-102033 .rb-filter-select { position: relative; }
  cbe--report-bug-102033 .rb-suggestions {
    position: absolute; top: 100%; left: 0; right: 0; z-index: 10; max-height: 220px; overflow: auto;
    background: #ffffff; border: 1px solid #cbd2d9; border-radius: 4px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  cbe--report-bug-102033 .rb-suggestion { padding: 8px; font-size: 12px; cursor: pointer; }
  cbe--report-bug-102033 .rb-suggestion:hover,
  cbe--report-bug-102033 .rb-suggestion.highlighted { background: #eef2f7; }
  cbe--report-bug-102033 .rb-suggestion.selected { color: #2563eb; font-weight: 700; }
  cbe--report-bug-102033 .rb-suggestion-group { color: #7b8794; }
  cbe--report-bug-102033 .rb-suggestion-empty { cursor: default; color: #7b8794; }
  cbe--report-bug-102033 .rb-suggestion-empty:hover { background: transparent; }
  cbe--report-bug-102033 .rb-send-error { font-size: 12px; color: #c53030; }
  cbe--report-bug-102033 .rb-sent { font-size: 12px; color: #2f855a; }
  cbe--report-bug-102033 .rb-send {
    align-self: flex-start; padding: 8px 24px; font: inherit; font-weight: 700; color: #ffffff;
    background: #2563eb; border: none; border-radius: 4px; cursor: pointer;
  }
  cbe--report-bug-102033 .rb-send:hover { background: #1d4ed8; }
  cbe--report-bug-102033 .rb-send:disabled { background: #9fb3c8; cursor: default; }
  cbe--report-bug-102033 .rb-screenshot { max-width: 100%; border: 1px solid #cbd2d9; border-radius: 4px; }
  cbe--report-bug-102033 .rb-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  cbe--report-bug-102033 .rb-table th {
    padding: 8px; text-align: left; font-weight: 700; color: #102a43;
    background: #f7f8fa; border-bottom: 1px solid #cbd2d9;
  }
  cbe--report-bug-102033 .rb-table td { padding: 8px; vertical-align: top; border-bottom: 1px solid #e4e7eb; }
  cbe--report-bug-102033 .rb-table .rb-url {
    max-width: 0; width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  cbe--report-bug-102033 .rb-table .rb-error td { color: #c53030; }
  cbe--report-bug-102033 .rb-boot-item { font-size: 12px; }
  cbe--report-bug-102033 .rb-boot-name { font-family: monospace; font-weight: 700; color: #102a43; cursor: pointer; }
  cbe--report-bug-102033 .rb-boot-undefined { color: #7b8794; }
  cbe--report-bug-102033 .rb-boot-json,
  cbe--report-bug-102033 .rb-console {
    max-height: 260px; overflow: auto; font-family: monospace; font-size: 12px;
    background: #ffffff; border: 1px solid #e4e7eb; border-radius: 4px;
  }
  cbe--report-bug-102033 .rb-boot-json { margin: 8px 0 0; padding: 8px; white-space: pre-wrap; word-break: break-word; }
  cbe--report-bug-102033 .rb-console-header {
    position: sticky; top: 0; display: flex; gap: 8px; padding: 8px;
    font-family: inherit; font-weight: 700; background: #f7f8fa; border-bottom: 1px solid #cbd2d9;
  }
  cbe--report-bug-102033 .rb-line {
    display: flex; gap: 8px; padding: 2px 8px; white-space: pre-wrap; word-break: break-word;
    border-bottom: 1px dotted #e4e7eb;
  }
  cbe--report-bug-102033 .rb-col-when { flex: 0 0 60px; color: #7b8794; }
  cbe--report-bug-102033 .rb-col-type { flex: 0 0 110px; color: #2563eb; }
  cbe--report-bug-102033 .rb-col-text { flex: 1; }
  cbe--report-bug-102033 .rb-error .rb-col-text,
  cbe--report-bug-102033 .rb-uncaught .rb-col-text,
  cbe--report-bug-102033 .rb-unhandledrejection .rb-col-text { color: #c53030; }
  cbe--report-bug-102033 .rb-warn .rb-col-text { color: #b7791f; }
</style>`;

if (!customElements.get(REPORT_BUG_TAG)) {
  customElements.define(REPORT_BUG_TAG, ReportBug);
}
