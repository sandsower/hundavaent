import { getContext, hasContext, setContext } from 'svelte';

// The wiring channel between Field and the control it wraps. Field publishes ids and validity;
// Input/Textarea/Select consume them so every field gets label association, aria-describedby,
// and aria-invalid without any call-site plumbing. A control rendered outside a Field finds no
// context and renders as a plain styled element - misuse degrades to exactly the unwired state
// the app shipped before this system existed, never to a broken one.
const FIELD_CONTEXT_KEY = Symbol('hundavaent-field');

export interface FieldContext {
  /** The id Field's own <label for> points at; the wrapped control must carry it. One control
      per Field: a second consumer under the same Field resolves this same id and produces
      duplicate DOM ids, and a caller-supplied id on the control is overridden by this one -
      both are silent misuse shapes, documented on Field's children prop. */
  readonly controlId: string;
  /** Space-joined ids of the hint/error paragraphs currently rendered; undefined when neither
      is. Exposed as a getter over $derived state so consumers stay live when an error appears
      after render. */
  readonly describedby: string | undefined;
  /** True while Field carries an error; the control renders aria-invalid from it. */
  readonly invalid: boolean;
}

export function provideFieldContext(context: FieldContext): void {
  setContext(FIELD_CONTEXT_KEY, context);
}

export function consumeFieldContext(): FieldContext | undefined {
  return hasContext(FIELD_CONTEXT_KEY) ? getContext<FieldContext>(FIELD_CONTEXT_KEY) : undefined;
}

/** Field-provided ids first, then whatever the caller passed - a call site that references its
    own external element (suggest's pin-required message pattern) keeps that reference alongside
    the field's hint/error wiring instead of losing one to the other. */
export function mergeDescribedby(
  fromField: string | undefined,
  fromCaller: string | null | undefined
): string | undefined {
  const merged = [fromField, fromCaller].filter(Boolean).join(' ');
  return merged === '' ? undefined : merged;
}
