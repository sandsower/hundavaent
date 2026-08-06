<script lang="ts">
  let {
    kind = 'trail',
    size = 'regular'
  }: {
    kind?: 'trail' | 'new' | 'updated' | 'empty' | 'private';
    size?: 'small' | 'regular' | 'large';
  } = $props();
</script>

<svg
  class="roundup-icon size-10 overflow-visible [&.large]:size-18 [&.small]:size-[1.4rem]"
  class:small={size === 'small'}
  class:large={size === 'large'}
  viewBox="0 0 64 64"
  fill="none"
  aria-hidden="true"
>
  <path
    class="trail"
    d="M9 48c8-2 9-10 17-12 8-3 12 5 20 1 5-2 7-7 9-12"
    stroke="currentColor"
    stroke-width="3.5"
    stroke-linecap="round"
    stroke-dasharray="2 7"
  />

  {#if kind === 'private'}
    <path
      d="M24 27v-4a8 8 0 0 1 16 0v4M21 27h22v19H21z"
      stroke="currentColor"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <circle cx="32" cy="36" r="2.5" fill="currentColor" />
  {:else if kind === 'empty'}
    <path
      d="M32 9c-8 0-14 6-14 14 0 11 14 25 14 25s14-14 14-25c0-8-6-14-14-14Z"
      stroke="currentColor"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <path d="M27 24h10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
  {:else}
    <g class="paw [transform-origin:32px_28px]">
      <ellipse cx="32" cy="31" rx="8" ry="7" fill="currentColor" />
      <ellipse cx="21" cy="25" rx="4" ry="5" fill="currentColor" />
      <ellipse cx="28" cy="18" rx="4" ry="5" fill="currentColor" />
      <ellipse cx="37" cy="18" rx="4" ry="5" fill="currentColor" />
      <ellipse cx="44" cy="25" rx="4" ry="5" fill="currentColor" />
    </g>
    {#if kind === 'new'}
      <path
        class="spark [transform-origin:50px_13px]"
        d="M50 8v10M45 13h10"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
      />
    {:else if kind === 'updated'}
      <path
        class="spark [transform-origin:50px_13px]"
        d="M48 10a7 7 0 1 1-2 12M48 10v7h-7"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {/if}
  {/if}
</svg>

<style>
  /* Every piece both moves and fades, so each runs as two entries, one per family: reduced
     motion stills the travel while the trail, paw, and spark keep appearing (see tokens.css). */
  .roundup-icon .trail {
    animation:
      trail-arrive var(--hv-motion-celebrate) var(--hv-ease-settle) both,
      trail-appear var(--hv-fade-considered) var(--hv-ease-settle) both;
  }

  .roundup-icon .paw {
    animation:
      paw-settle var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 2) var(--hv-ease-settle)
        both,
      paw-appear var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 2) var(--hv-ease-settle)
        both;
  }

  .roundup-icon .spark {
    animation:
      spark-turn var(--hv-motion-celebrate) calc(var(--hv-motion-stagger) * 4) var(--hv-ease-settle)
        both,
      spark-appear var(--hv-fade-considered) calc(var(--hv-motion-stagger) * 4)
        var(--hv-ease-settle) both;
  }

  @keyframes trail-arrive {
    from {
      stroke-dashoffset: 32;
    }
  }

  @keyframes trail-appear {
    from {
      opacity: 0.25;
    }
  }

  @keyframes paw-settle {
    from {
      transform: translateY(-4px) scale(0.86);
    }
  }

  @keyframes paw-appear {
    from {
      opacity: 0;
    }
  }

  @keyframes spark-turn {
    from {
      transform: rotate(-35deg) scale(0.65);
    }
  }

  @keyframes spark-appear {
    from {
      opacity: 0;
    }
  }
</style>
