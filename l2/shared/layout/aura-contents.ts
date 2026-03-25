/// <mls fileReference="_102033_/l2/shared/layout/aura-contents.ts" enhancement="_blank" />
import { LitElement, html } from 'lit';

export class AuraContents extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <style>
        collab-aura-contents {
          display: block;
          min-height: 100%;
        }

        collab-aura-contents .contents {
          height: 100%;
          min-height: calc(100vh - 73px);
          padding: 24px;
          background:
            radial-gradient(circle at top right, rgba(255, 207, 117, 0.28), transparent 26%),
            linear-gradient(180deg, #f7f4ea 0%, #fffdfa 100%);
        }
      </style>
      <section class="contents"><div data-module-host></div></section>
    `;
  }
}

customElements.define('collab-aura-contents', AuraContents);
