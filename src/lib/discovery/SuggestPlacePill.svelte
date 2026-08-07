<script lang="ts">
  interface Props {
    href: string;
    label: string;
    /**
     * True while the map is being panned or zoomed. Discovery chrome steps back during a gesture
     * and returns on its own when it settles.
     */
    quiet?: boolean;
  }

  let { href, label, quiet = false }: Props = $props();
</script>

<!-- The permanent way to add a Place that is not on the map yet. It is discovery chrome: it floats
     over the map, it never takes the map's gestures except on the pill itself, and the shell hides
     it whole while a Place is selected or the cluster is folded away. -->
<!-- Above the map attribution strip, which owns the bottom edge on every layout. The lift is
     the shell's, because the shell reserves this same band in the panels beside the map. -->
<!-- The dock spans the map so the pill can centre in it; only the pill takes pointer events, so
     the map keeps every gesture either side of it. -->
<!-- Map gestures are quiet: the pill steps back with the rest of the browse chrome and comes back
     when the gesture settles. Opacity only, and only the same 0.35 the command cluster uses. -->
<div
  class="suggest-dock absolute z-[3] right-[var(--floating-card-inset,0.75rem)] bottom-[calc(var(--floating-card-inset,0.75rem)_+_var(--suggest-dock-lift,1.75rem))] left-[var(--floating-card-inset,0.75rem)] flex justify-center pointer-events-none transition-opacity duration-[var(--hv-fade-quick)] ease-settle data-[quiet=true]:opacity-[0.35]"
  data-suggest-dock
  data-quiet={quiet}
  data-motion="tokenized"
>
  <!-- A full navigation (not a client-side route transition) keeps the destination's own
       sign-in handoff deterministic instead of racing the SPA router's async goto(). -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -- href is pre-resolved by the caller with $app/paths resolve() -->
  <!-- Movement only, like every other pill in the command cluster. -->
  <a
    class="suggest-pill inline-flex min-h-control max-w-full items-center gap-[0.4rem] py-[0.4rem] px-[1.1rem] border border-moss rounded-[999px] bg-moss-soft font-[850] tracking-[-0.015em] text-basalt no-underline shadow-floating pointer-events-auto transition-[transform] duration-[var(--hv-motion-instant)] ease-settle hover:transform-[translateY(-1px)] active:transform-[scale(0.94)] focus-visible:[outline:3px_solid_var(--hv-focus-ring)] focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
    {href}
    data-sveltekit-reload
  >
    <span class="pill-glyph text-[1.15rem] leading-none font-black" aria-hidden="true">+</span>
    {label}
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</div>
