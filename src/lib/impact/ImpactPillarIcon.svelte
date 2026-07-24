<script lang="ts">
  type ImpactIcon =
    'rhythm' | 'exploration' | 'knowledge' | 'contribution' | 'recognition' | 'outcome';

  let { kind, size = 'large' }: { kind: ImpactIcon; size?: 'small' | 'large' } = $props();
</script>

<span class={`impact-icon ${size}`} data-impact-icon={kind} aria-hidden="true">
  <svg viewBox="0 0 64 64" role="presentation">
    {#if kind === 'rhythm'}
      <path class="soft" d="M13 43c8-20 19-29 38-25-9 4-14 11-17 21-7-4-14-3-21 4Z" />
      <path d="M15 45c8-13 18-20 32-22M27 34l3 10M38 27l4 8" />
      <circle class="accent" cx="16" cy="45" r="4" />
      <circle class="accent" cx="48" cy="22" r="4" />
    {:else if kind === 'exploration'}
      <path class="soft" d="M10 17l14-6 16 6 14-6v36l-14 6-16-6-14 6V17Z" />
      <path d="M24 12v35m16-29v35M15 25c7 3 13 2 18-3s11-6 17-3" />
      <circle class="accent" cx="34" cy="22" r="4" />
    {:else if kind === 'knowledge'}
      <path class="soft" d="M13 16h27c6 0 11 5 11 11v21H24c-6 0-11-5-11-11V16Z" />
      <path d="M21 25h22M21 33h17M21 41h10" />
      <path class="accent" d="m40 42 5 5 9-12" />
    {:else if kind === 'contribution'}
      <path class="soft" d="M13 13h38v31H34L23 53v-9H13V13Z" />
      <path d="M22 24h20M22 32h13" />
      <path class="accent" d="m39 39 4 4 8-10" />
    {:else if kind === 'recognition'}
      <path
        class="soft"
        d="m32 9 7 6 9-1 1 9 6 7-6 7-1 9-9-1-7 6-7-6-9 1-1-9-6-7 6-7 1-9 9 1 7-6Z"
      />
      <path class="accent" d="m23 31 6 6 13-15" />
    {:else}
      <path class="soft" d="M13 11h38v42H13z" />
      <path d="M21 22h22M21 31h18M21 40h12" />
      <circle class="accent" cx="45" cy="42" r="7" />
      <path class="accent-line" d="m42 42 2 2 4-5" />
    {/if}
  </svg>
</span>

<style>
  .impact-icon {
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--impact-tone, var(--hv-color-moss)) 13%, white);
    color: color-mix(in srgb, var(--impact-tone, var(--hv-color-moss)) 82%, black);
  }

  .impact-icon.large {
    width: 3.3rem;
    height: 3.3rem;
  }

  .impact-icon.small {
    width: 2.35rem;
    height: 2.35rem;
    border-radius: 0.75rem;
  }

  svg {
    width: 78%;
    height: 78%;
    overflow: visible;
  }

  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .soft {
    fill: color-mix(in srgb, var(--impact-tone, var(--hv-color-moss)) 16%, white);
    stroke-width: 2.2;
  }

  .accent {
    fill: var(--impact-tone, var(--hv-color-moss));
    stroke: white;
    stroke-width: 2.5;
  }

  path.accent {
    fill: none;
    stroke: var(--impact-tone, var(--hv-color-moss));
    stroke-width: 4;
  }

  .accent-line {
    stroke: white;
    stroke-width: 2;
  }
</style>
