<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';

  type Intent = 'neutral' | 'primary' | 'committed' | 'quiet' | 'danger' | 'danger-quiet';

  interface ButtonOwnProps {
    intent?: Intent;
    /** Present at all when this Button is a toggle; true renders the same look as `committed`. */
    pressed?: boolean;
    /** Undefined renders the default pill/control shape. 'round' renders the circular icon-only
     * shape codified from the surveyed icon family (SelectedPlaceCard .icon-action,
     * SharePlaceControl .icon-control) - see shapeClasses below. */
    shape?: 'round';
    href?: string;
    type?: HTMLButtonAttributes['type'];
    class?: string;
    children: Snippet;
    // Declared here, rather than left to the intersection below, because HTMLAnchorAttributes and
    // HTMLButtonAttributes each carry their own onclick signature with a different `currentTarget`
    // element type. Intersecting two functions with incompatible parameter types collapses them
    // into unusable overloads - a caller whose handler accepts the union of both elements (as every
    // interactive Story's `args.onclick` does) fails to satisfy either overload. Naming onclick here
    // with a single signature over the *union* element type sidesteps that: it is `Omit`-ted out of
    // the intersection below, so this is the only onclick signature Props exposes, and it is
    // satisfied both by handlers written for the union and by handlers written for one element that
    // narrow via a cast - see FavouriteControl.svelte's `event.currentTarget as HTMLButtonElement`.
    //
    // The same intersected-overload wall applies to every other element-specific-typed handler
    // still left to the Omit<HTMLAnchorAttributes & HTMLButtonAttributes, ...> intersection below
    // - onkeydown, onfocus, onblur, and the rest each carry a currentTarget typed to their own
    // element in HTMLAnchorAttributes vs HTMLButtonAttributes, and intersecting them collapses to
    // unusable overloads exactly like onclick did. None of those are pulled out here because
    // nothing in this codebase currently needs one on Button; if a call site does, the fix is the
    // same as onclick's: either type the handler with the union currentTarget (HTMLAnchorElement |
    // HTMLButtonElement) so it satisfies the intersection's narrowed member, or write an inline
    // closure at the call site and narrow via a cast, the way FavouriteControl does for onclick.
    onclick?: (
      event: MouseEvent & { currentTarget: EventTarget & (HTMLAnchorElement | HTMLButtonElement) }
    ) => void;
  }

  // href decides the rendered element, so the two native attribute sets are intersected rather
  // than kept as a discriminated union: callers pass one Button and let the markup pick <a> or
  // <button>, and every prop not owned above (aria-*, data-*, disabled, ...) spreads through
  // untouched regardless of which element it lands on. onclick is the one native handler pulled
  // out into ButtonOwnProps above rather than left to this intersection - see the comment there.
  type Props = ButtonOwnProps &
    Omit<HTMLAnchorAttributes & HTMLButtonAttributes, keyof ButtonOwnProps>;

  let {
    intent = 'neutral',
    pressed,
    shape,
    href,
    type,
    class: className = '',
    children,
    ...rest
  }: Props = $props();

  // The exact utility codification of the retired legacy .hv-control primitive: min-height, the
  // 1px border (width/style only - see below), weight 800, and no underline. Border colour,
  // background, text colour, radius, and padding are deliberately absent here - they come from
  // intentClasses and shapeClasses below, each as a single matched set, never layered on top of
  // this or on top of each other. This is more than the original two-property split: border
  // colour lives in intentClasses (a `quiet` intent needs
  // border-fjord, not border-border-strong, alongside its own background/text), and radius+padding
  // live in shapeClasses (a `round` Button needs rounded-full and zero padding, not
  // rounded-control's pill radius and fixed inset). `base` keeps only the unqualified `border`
  // utility, which owns width and style but never colour on its own.
  // font-extrabold (not font-bold) matches .hv-control's font-weight: 800. The three inherited
  // properties are named individually rather than via the `[font:inherit]` shorthand: that
  // shorthand also resets font-weight, and its resolution order against a separate weight utility
  // is not something Tailwind's generated stylesheet order guarantees - naming family/size/line-height
  // directly leaves font-weight solely owned by font-extrabold.
  // The standard hover/active/cursor treatment, owned here rather than duplicated per call site.
  // This is the exact codification of the idiom surveyed from CheckInControl.svelte (.hv-control),
  // FavouriteControl.svelte (.favourite-toggle), and SuggestPlacePill.svelte (.suggest-pill):
  // pointer cursor while enabled, a -1px hover lift gated on not-disabled AND not-aria-pressed
  // (the settled/selected state stays put, per FavouriteControl's comment "The outline state
  // invites; the saved state is already settled"), and a 0.97 active squish gated on not-disabled
  // - the standard control squish; smaller round pills using a stronger squish is deliberate
  // call-site character, not a deviation to fix. The transition rides --hv-motion-instant, the
  // same control tempo, so reduced motion and operations mode retune it exactly as they do at
  // every surveyed call site. Anchors carry no :disabled attribute, so not-disabled resolves true
  // there, which is the correct outcome - a link-mode Button still gets the lift.
  //
  // The focus ring is not Button's to declare: theme.css's `@layer base` rule is the single owner
  // for both the app and Storybook, so no focus-visible utilities appear in this string.
  // The disabled pair codifies the affordance the surveyed call sites converged on (account's
  // .disabled-fade hook, the candidate review shell's button:disabled rule): dimmed to 0.55 with
  // a not-allowed cursor, tone kept. Before this Button had no disabled styling at all, so a
  // disabled committed/danger action rendered full-strength with a pointer cursor -
  // indistinguishable from ready. Anchors carry no :disabled, so the variants are inert in link
  // mode, which is correct (there is no disabled link). Call sites with a deliberately different
  // disabled affordance (CheckInControl's cursor: wait at 0.72) out-rank these with scoped rules.
  const base =
    'inline-flex min-h-control items-center justify-center border [font-family:inherit] [font-size:inherit] [line-height:inherit] font-extrabold no-underline cursor-pointer transition-transform duration-[var(--hv-motion-instant)] ease-settle not-disabled:not-aria-pressed:hover:-translate-y-px not-disabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-[0.55]';

  // Each intent is a complete border/background/text triple, not an override layered on the base
  // classes: Tailwind resolves two utilities that touch the same CSS property (say
  // border-border-strong and border-fjord, or bg-snow-raised and bg-basalt) by their position in
  // the generated stylesheet, not by their order in the class attribute, so having two utilities
  // for the same property in the list at once is not a safe way to express "this one wins" - the
  // same reason border colour was pulled out of `base` above. Six intents, surveyed from the
  // shipped call sites this migration is codifying:
  // - neutral/primary/committed: unchanged, the strong border this file has always used.
  // - quiet: the fjord-outline back-link/secondary treatment hand-rolled across
  //   account/impact/roundup/contributor-status/achievements surfaces.
  // - danger: moderation's filled destructive flavour (solid danger fill, snow-raised text).
  // - danger-quiet: the account-deletion / correction-controls outline flavour (danger border and
  //   text on snow-raised, no fill).
  const intentClasses: Record<Intent, string> = {
    neutral: 'border-border-strong bg-snow-raised text-basalt',
    primary: 'border-border-strong bg-basalt text-snow-raised',
    committed: 'border-border-strong bg-signal text-basalt',
    quiet: 'border-fjord bg-snow-raised text-fjord',
    danger: 'border-danger bg-danger text-snow-raised',
    'danger-quiet': 'border-danger bg-snow-raised text-danger'
  };

  // Radius and padding move out of `base` for the same same-property reason border colour did:
  // `default` is exactly the pill radius/padding pair `base` used to carry directly. `round` ties
  // both dimensions to --hv-control-height via Tailwind's `spacing-control` theme mapping
  // (theme.css, itself `var(--hv-control-height)`) rather than a literal rem value, so the square
  // retunes with the token exactly as [data-ui-mode='operations'] already retunes every other
  // control-height consumer. The surveyed icon family (SelectedPlaceCard .icon-action,
  // SharePlaceControl .icon-control) hand-rolls a literal 2.5rem square - that literal matches
  // operations mode's retuned --hv-control-height (tokens.css), not the Member-mode default of
  // 2.75rem, so a literal here would only have been correct in one mode. w-control and h-control
  // both resolve the same var(--hv-control-height) reference at the element, guaranteeing a square
  // in either mode without an aspect-ratio fallback.
  const shapeClasses = {
    default: 'rounded-control px-[0.8rem] py-[0.55rem]',
    round: 'rounded-full p-0 w-control h-control'
  } as const;

  // A pressed Button always reads as committed. The two states are visually identical today, and
  // pressed is the more specific signal, so it wins over whatever intent was passed. Note the
  // latent interaction this creates for the danger intents: a pressed danger toggle would render
  // signal, not danger. No call site combines pressed with a danger intent today (pressed is used
  // only with neutral); if one ever needs to, this precedence has to be revisited rather than
  // worked around at the call site.
  const visualIntent = $derived(pressed === true ? 'committed' : intent);
  const isRound = $derived(shape === 'round');

  // Round buttons keep base's inline-flex centering rather than switching to inline-grid +
  // place-items:center, which is what the surveyed icon family (.icon-action, .icon-control) uses:
  // for a single glyph child, flex's main/cross-axis centering (items-center justify-center,
  // already on base) and grid's place-items centering produce an identical result, so there is no
  // need for shapeClasses to touch display/alignment at all.
  const classes = $derived(
    [
      base,
      // Round + neutral is a documented special case, not a seventh intent: the surveyed icon
      // family sits on snow-raised with the SUBTLE border token, not neutral's usual strong
      // border. Swapping the border utility here - rather than adding border-border-subtle
      // alongside border-border-strong in the list - avoids ever putting two border-colour
      // utilities in the same class attribute at once (see the intentClasses comment above).
      // Every other intent keeps its own border unchanged when rounded.
      isRound && visualIntent === 'neutral'
        ? intentClasses.neutral.replace('border-border-strong', 'border-border-subtle')
        : intentClasses[visualIntent],
      shapeClasses[isRound ? 'round' : 'default'],
      className
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

{#if href}
  <!-- No aria-pressed here: a link cannot be a toggle, and role link rejects the attribute. The
       pressed prop still drives the selected look for the rare anchor that wants it. -->
  <!-- `disabled` has no effect on an anchor: it is not a recognised HTML attribute there, so it
       renders as an inert data-less attribute (disabled="") and the link stays fully operable -
       clickable, focusable, reachable by keyboard - regardless of its value. There is no browser-level
       equivalent of a disabled link. A call site that maps a busy/unavailable state onto a Button
       rendered as an anchor (href set) must gate that itself - e.g. by omitting href, by intercepting
       the click and no-op'ing, or by routing to a non-interactive element instead - rather than
       relying on passing `disabled` through here. -->
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Button is a generic primitive; href arrives pre-resolved (or intentionally external) from whichever caller supplied it. -->
  <a {href} class={classes} {...rest}>
    {@render children()}
  </a>
{:else}
  <button class={classes} {...rest} type={type ?? 'button'} aria-pressed={pressed}>
    {@render children()}
  </button>
{/if}
