<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface ChoiceOwnProps {
    /** Radio vs checkbox is never implicit: every call site names it explicitly. Omit'd out of
        the intersection below (not left to the spread) so a caller cannot pass a stray `type`
        through rest and have it silently race this prop for the rendered input's actual type. */
    type: 'radio' | 'checkbox';
    /** Declared here (not left to the native attribute set) so it is $bindable: a choice group
        drives its selection through this, and a spread-through attribute cannot be bound - the
        same reason Input's value is pulled out of its own intersection. Wired by hand below
        rather than through Svelte's bind:checked sugar - see the comment on handleChange. */
    checked?: boolean;
    /** Call-site hooks and non-conflicting layout utilities only - the same contract as every
        other primitive's class prop. */
    class?: string;
    /** The choice text. Copy arrives from the caller, already localized - this component carries
        none of its own, same as Field's label. */
    children: Snippet;
  }

  // Everything not owned above (name, value, required, disabled, onchange, ...) spreads onto the
  // native input untouched.
  type Props = ChoiceOwnProps & Omit<HTMLInputAttributes, keyof ChoiceOwnProps>;

  let { type, checked = $bindable(), class: className = '', children, ...rest }: Props = $props();

  // Manual checked wiring, not Svelte's bind:checked sugar: bind:checked only targets
  // type="checkbox" - a radio's two-way binding idiom is bind:group, which binds the group's
  // selected *value*, not one input's boolean checked state - so a single boolean $bindable
  // shared across both types has to be driven by hand instead. This also keeps `type` a single
  // dynamic expression rather than forcing an {#if radio}/{:else checkbox} branch pair: Svelte's
  // static-type restriction on a dynamic `type` attribute (svelte.dev/e/attribute_invalid_type)
  // only fires where bind: sugar is used, and nothing here uses it. Caller-supplied onchange
  // (left on rest, since onchange is not an own prop) still runs - it is not lost by this
  // override, the same "chain, don't clobber" contract as Field's describedby merge.
  function handleChange(event: Event & { currentTarget: EventTarget & HTMLInputElement }): void {
    checked = event.currentTarget.checked;
    rest.onchange?.(event);
  }

  // The exact utility codification of suggest/+page.svelte's .choice, once part of the retired
  // legacy stylesheet: the auto/1fr grid, the 0.6rem gap, centered items, the control min-height
  // token, weight 800, and basalt ink. cursor-pointer sits on the whole row (not just the input)
  // because the label wrap below makes the entire row the hit target, not only the control.
  const classes = $derived(
    [
      'grid grid-cols-[auto_1fr] gap-[0.6rem] items-center min-h-control text-basalt font-extrabold cursor-pointer',
      className
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

<!-- Label wraps control here, deliberately unlike Field's for/id split: the choice text IS the
     whole label - there is no separate visible label text sitting outside the control for a
     for/id pairing to point at, so wrapping is the entire association contract. -->
<!-- Choice does not consume the field context and never calls consumeFieldContext(): a group of
     these is labelled by a <fieldset> + <legend> at the call site (suggest/+page.svelte's
     .choices pattern, now FormSection's own contract), never by wrapping a single Choice in a
     Field. -->
<label class={classes}>
  <!-- size-5 (1.25rem) matches the shipped .choice input exactly. No appearance or accent-color
       utility here on purpose: the UA's own radio/checkbox rendering and its accent-color are
       kept as the baseline-first call for this primitive, the same "ship the native control"
       starting point every other primitive in this migration began from - a themed custom
       control is a deliberate future addition, not an oversight. -->
  <input class="size-5" {type} {...rest} {checked} onchange={handleChange} />
  <span>{@render children()}</span>
</label>
