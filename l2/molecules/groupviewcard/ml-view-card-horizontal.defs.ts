/// <mls fileReference="_102033_/l2/molecules/groupviewcard/ml-view-card-horizontal.defs.ts" enhancement="_blank" />

// Do not change – automatically generated code. 

export const group = 'groupViewCard';
export const skill = `# Metadata
- TagName: groupviewcard--ml-view-card-horizontal
# Objective
Provide a compact horizontal card for list items with left media content and right text content, supporting interactive and stateful behaviors.
# Responsibilities
- Render a card with a horizontal layout.
- Display the CardContent slot on the left side of the card.
- Display the CardHeader slot to the right of CardContent.
- Display the CardFooter slot below the CardHeader within the right section when provided.
- Display the CardAction slot within the right section when provided.
- Support a clickable state that makes the card interactive.
- Emit a cardClick event when activated by pointer interaction while clickable.
- Emit a cardClick event when activated by Enter or Space while focused and clickable.
- Support a selected state that visually highlights the card.
- Support a disabled state that makes the card non-interactive and visually dimmed.
- Support a loading state that replaces content with a placeholder representation of the layout.
- Pass the isEditing attribute to child components within the card.
- Apply button semantics when clickable, including focusability.
- Expose aria-selected when selected.
- Expose aria-disabled when disabled.
# Constraints
- When disabled, the card must not emit cardClick events.
- When loading, normal content must not be displayed.
- The card must remain compact and suitable for use in list layouts.
- Visual placement must keep left media content constrained to a small width and text content on the right.
# Notes
- CardHeader may include CardTitle and CardDescription content.`;

