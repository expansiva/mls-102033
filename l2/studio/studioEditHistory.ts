/// <mls fileReference="_102033_/l2/studio/studioEditHistory.ts" enhancement="_blank" />
// Undo/redo for the in-place editor (TASK-102033-picker-undo).
//
// WHY NOT THE MONACO STACK
// The model has `undo()`, and it is the wrong tool: it undoes the TEXT and nothing else. It does not
// put the class back on the element on screen, does not recompile, does not tell the live update, and
// does not know the local copy has to be rewritten. Undo has to walk the SAME path as a normal edit,
// or the file and the screen drift apart — the exact state this whole editor exists to prevent.
//
// So: a stack of steps, replayed through the normal write. This module is the stack, and only the
// stack — it never applies anything and never touches the DOM, which is what makes it testable on its
// own. What a step IS belongs to the editor (see EditStep there); here it is an opaque payload.
//
// THE TWO-PHASE HANDSHAKE
// A step is not popped and hoped for. The caller PEEKS, tries to apply, and then says what happened:
//
//   const step = history.peekUndo();
//   if (!step) return;
//   if (await apply(step)) history.commitUndo(); else history.dropUndo();
//
// That is what makes risk 1 of the task survivable: an agent (or the user, in the code editor) can
// rewrite the file under us, and reapplying a stale step would corrupt it. The editor revalidates
// while applying — it looks for the exact text the step says should be there — and a step that no
// longer matches is refused instead of forced.

/** How many steps are kept. Beyond this the oldest is forgotten, never the newest. */
export const HISTORY_LIMIT = 50;

export class EditHistory<TStep> {

  private readonly undoStack: TStep[] = [];
  private readonly redoStack: TStep[] = [];

  constructor(private readonly limit: number = HISTORY_LIMIT) {}

  /**
   * Records an edit that just landed.
   *
   * It also drops the redo branch: after a new edit, what had been undone no longer describes this
   * file, and offering to "redo" it would write over the change the user just made.
   */
  push(step: TStep): void {
    this.undoStack.push(step);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  peekUndo(): TStep | undefined {
    return this.undoStack[this.undoStack.length - 1];
  }

  peekRedo(): TStep | undefined {
    return this.redoStack[this.redoStack.length - 1];
  }

  /** The step was applied: it crosses to the other side, where it can be redone. */
  commitUndo(): void {
    const step = this.undoStack.pop();
    if (step !== undefined) this.redoStack.push(step);
  }

  commitRedo(): void {
    const step = this.redoStack.pop();
    if (step !== undefined) this.undoStack.push(step);
  }

  /**
   * The step could not be applied — and everything OLDER goes with it.
   *
   * Not zeal: the steps are a chain. If the file no longer holds what the newest step wrote, the
   * older ones describe a file that is further away still, and applying them would be writing over
   * whatever took their place. Better to lose the history than to corrupt the file.
   */
  dropUndo(): void {
    this.undoStack.length = 0;
  }

  /** Same, on the redo side: the branch is gone. */
  dropRedo(): void {
    this.redoStack.length = 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get depth(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }
}
