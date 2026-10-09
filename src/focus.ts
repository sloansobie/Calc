import type { MathfieldElement } from "mathlive";

export function focusMathfield(field: MathfieldElement | undefined) {
  if (!field) return;
  field.focus();
  // MathLive delays keyboard focus by 60 ms. Focus its exported keyboard part
  // immediately so rapid typing after Enter lands in the newly created row.
  field.shadowRoot
    ?.querySelector<HTMLElement>('[part="keyboard-sink"]')
    ?.focus({ preventScroll: true });
}
