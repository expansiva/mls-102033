/// <mls fileReference="_102033_/l2/molecules/groupnavigatesteps/ml-tabs.ts" enhancement="_102020_/l2/enhancementAura" />

// =============================================================================
// VERTICAL STEPPER MOLECULE
// =============================================================================
// Skill Group: navigate + steps
// This molecule does NOT contain business logic.
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { customElement } from 'lit/decorators.js';
import { propertyDataSource } from '/_102029_/l2/collabDecorators';
import { MoleculeAuraElement } from '/_102033_/l2/moleculeBase.js';

/// **collab_i18n_start**
const message_en = {
  loading: 'Loading steps...',
  empty: 'No steps available',
  steps: 'Steps',
  completed: 'completed',
};

type MessageType = typeof message_en;
const messages: Record<string, MessageType> = {
  en: message_en,
  pt: {
    loading: 'Carregando etapas...',
    empty: 'Nenhuma etapa disponível',
    steps: 'Etapas',
    completed: 'concluída',
  },
};
/// **collab_i18n_end**

interface StepItem {
  index: number;
  title: string;
  description: string | null;
  completed: boolean;
  disabled: boolean;
}

@customElement('groupnavigatesteps--ml-vertical-stepper')
export class MlVerticalStepperMolecule extends MoleculeAuraElement {
  private msg: MessageType = messages.en;

  // ==========================================================================
  // SLOT TAGS
  // ==========================================================================
  slotTags = ['Label', 'Step'];

  // ==========================================================================
  // PROPERTIES — From Contract
  // ==========================================================================
  @propertyDataSource({ type: Number })
  value = 0;

  @propertyDataSource({ type: Boolean })
  linear = true;

  @propertyDataSource({ type: Boolean })
  disabled = false;

  @propertyDataSource({ type: Boolean })
  loading = false;

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================
  private handleStepClick(index: number) {
    const steps = this.parseSteps();
    this.selectStep(index, steps);
  }

  private handleKeydown(e: KeyboardEvent) {
    const target = e.currentTarget as HTMLElement;
    const indexAttr = target.getAttribute('data-index');
    if (!indexAttr) return;
    const index = Number(indexAttr);
    if (Number.isNaN(index)) return;

    const steps = this.parseSteps();

    if (['ArrowDown', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const nextIndex = this.findNextNavigableIndex(index + 1, 1, steps);
      if (nextIndex !== null) {
        this.selectStep(nextIndex, steps);
        this.focusStep(nextIndex);
      }
      return;
    }

    if (['ArrowUp', 'ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const prevIndex = this.findNextNavigableIndex(index - 1, -1, steps);
      if (prevIndex !== null) {
        this.selectStep(prevIndex, steps);
        this.focusStep(prevIndex);
      }
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      const firstIndex = this.findNextNavigableIndex(0, 1, steps);
      if (firstIndex !== null) {
        this.selectStep(firstIndex, steps);
        this.focusStep(firstIndex);
      }
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      const lastIndex = this.findNextNavigableIndex(steps.length - 1, -1, steps);
      if (lastIndex !== null) {
        this.selectStep(lastIndex, steps);
        this.focusStep(lastIndex);
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.selectStep(index, steps);
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================
  private parseSteps(): StepItem[] {
    const stepEls = this.getSlots('Step');
    return stepEls
      .map((el, index) => {
        const title = (el.getAttribute('title') || '').trim();
        if (!title) return null;
        const description = el.getAttribute('description');
        return {
          index,
          title,
          description,
          completed: el.hasAttribute('completed'),
          disabled: el.hasAttribute('disabled'),
        } as StepItem;
      })
      .filter((s): s is StepItem => Boolean(s));
  }

  private getLabelText(): string {
    const labelEl = this.getSlot('Label');
    const text = labelEl?.textContent?.trim();
    return text && text.length > 0 ? text : this.msg.steps;
  }

  private canNavigateTo(index: number, step: StepItem, steps: StepItem[]): boolean {
    if (this.disabled) return false;
    if (step.disabled) return false;

    if (!this.linear) return true;

    if (index <= this.value) return true;

    const current = steps[this.value];
    const currentCompleted = current?.completed ?? false;

    if (index === this.value + 1 && currentCompleted) return true;

    return step.completed;
  }

  private selectStep(index: number, steps: StepItem[]) {
    const step = steps[index];
    if (!step) return;
    if (!this.canNavigateTo(index, step, steps)) return;
    this.value = index;
    this.dispatchEvent(
      new CustomEvent('change', {
        bubbles: true,
        composed: true,
        detail: { value: index, title: step.title },
      })
    );
  }

  private findNextNavigableIndex(start: number, direction: 1 | -1, steps: StepItem[]): number | null {
    let i = start;
    while (i >= 0 && i < steps.length) {
      const step = steps[i];
      if (step && this.canNavigateTo(i, step, steps)) return i;
      i += direction;
    }
    return null;
  }

  private focusStep(index: number) {
    const el = this.querySelector(`[data-index="${index}"]`) as HTMLElement | null;
    el?.focus();
  }

  private getStepButtonClasses(isActive: boolean, isCompleted: boolean, isDisabled: boolean): string {
    return [
      'flex w-full items-start gap-3 rounded-md p-1 text-left transition',
      'focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400',
      isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      isActive ? 'bg-sky-50 dark:bg-sky-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700',
      isCompleted && !isActive ? 'bg-transparent' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getIndicatorClasses(isActive: boolean, isCompleted: boolean, isDisabled: boolean): string {
    if (isCompleted) {
      return [
        'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
        'bg-sky-500 dark:bg-sky-400',
        'text-white dark:text-slate-900',
        'border-sky-500 dark:border-sky-400',
      ].join(' ');
    }

    if (isActive) {
      return [
        'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
        'bg-sky-50 dark:bg-sky-900/40',
        'text-sky-700 dark:text-sky-300',
        'border-sky-500 dark:border-sky-400',
      ].join(' ');
    }

    return [
      'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
      isDisabled
        ? 'bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-700'
        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600',
    ].join(' ');
  }

  private getTitleClasses(isActive: boolean, isCompleted: boolean, isDisabled: boolean): string {
    if (isDisabled) {
      return 'text-sm font-medium text-slate-400 dark:text-slate-600';
    }
    if (isActive) {
      return 'text-sm font-medium text-sky-700 dark:text-sky-300';
    }
    if (isCompleted) {
      return 'text-sm font-medium text-slate-900 dark:text-slate-100';
    }
    return 'text-sm font-medium text-slate-700 dark:text-slate-300';
  }

  private getDescriptionClasses(isDisabled: boolean): string {
    return isDisabled
      ? 'text-xs text-slate-400 dark:text-slate-600'
      : 'text-xs text-slate-500 dark:text-slate-400';
  }

  private getConnectorClasses(index: number, steps: StepItem[]): string {
    const next = steps[index + 1];
    const isNextActive = index + 1 === this.value;
    const isNextCompleted = next?.completed ?? false;
    return [
      'mt-2 h-6 w-px',
      isNextActive || isNextCompleted
        ? 'bg-sky-500 dark:bg-sky-400'
        : 'bg-slate-200 dark:bg-slate-700',
    ].join(' ');
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  render() {
    const lang = this.getMessageKey(messages);
    this.msg = messages[lang];

    if (this.loading) {
      return html`
        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-slate-600 dark:text-slate-400">
          ${this.msg.loading}
        </div>
      `;
    }

    const steps = this.parseSteps();
    if (steps.length === 0) {
      return html`
        <div class="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
          ${this.msg.empty}
        </div>
      `;
    }

    const labelText = this.getLabelText();

    return html`
      <div class="w-full">
        ${this.hasSlot('Label')
        ? html`
              <div class="mb-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                ${unsafeHTML(this.getSlotContent('Label'))}
              </div>
            `
        : nothing}

        <ol
          class="flex flex-col gap-4"
          role="tablist"
          aria-label=${ifDefined(labelText)}
        >
          ${steps.map((step, index) => {
          const isActive = step.index === this.value;
          const isCompleted = step.completed;
          const canNavigate = this.canNavigateTo(index, step, steps);
          const isDisabled = !canNavigate || this.disabled;
          const isLast = index === steps.length - 1;
          const ariaLabel = `${step.title}${isCompleted ? ` - ${this.msg.completed}` : ''}`;

          return html`
              <li class="flex">
                <button
                  class=${this.getStepButtonClasses(isActive, isCompleted, isDisabled)}
                  role="tab"
                  aria-selected=${isActive ? 'true' : 'false'}
                  aria-disabled=${isDisabled ? 'true' : 'false'}
                  aria-label=${ifDefined(ariaLabel)}
                  data-index=${index}
                  tabindex=${isActive ? '0' : '-1'}
                  @click=${() => this.handleStepClick(index)}
                  @keydown=${this.handleKeydown}
                >
                  <div class="flex flex-col items-center">
                    <div class=${this.getIndicatorClasses(isActive, isCompleted, isDisabled)}>
                      ${isCompleted
              ? html`
                            <svg
                              class="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M16.704 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
                                clip-rule="evenodd"
                              />
                            </svg>
                          `
              : html`<span>${step.index + 1}</span>`}
                    </div>
                    ${!isLast ? html`<div class=${this.getConnectorClasses(index, steps)}></div>` : nothing}
                  </div>
                  <div class="flex flex-col">
                    <span class=${this.getTitleClasses(isActive, isCompleted, isDisabled)}>${step.title}</span>
                    ${step.description
              ? html`<span class=${this.getDescriptionClasses(isDisabled)}>${step.description}</span>`
              : nothing}
                  </div>
                </button>
              </li>
            `;
        })}
        </ol>
      </div>
    `;
  }
}
