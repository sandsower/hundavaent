<script lang="ts">
  /**
   * Artwork is Lucide (ISC) - https://github.com/lucide-icons/lucide - vendored as path data,
   * the same library and convention the map markers already use (src/lib/map/marker-icons.ts).
   * Lucide's contract is a 24-unit grid with a 2px stroke and round caps, so every mark is
   * single-weight line art: the tinted tile carries the colour, no glyph needs a fill or an
   * accent of its own.
   */
  type ImpactIcon =
    'rhythm' | 'exploration' | 'knowledge' | 'contribution' | 'recognition' | 'outcome';

  let { kind, size = 'large' }: { kind: ImpactIcon; size?: 'small' | 'large' } = $props();
</script>

<span class={`impact-icon ${size}`} data-impact-icon={kind} aria-hidden="true">
  <svg viewBox="0 0 24 24" role="presentation">
    {#if kind === 'rhythm'}
      <!-- lucide/calendar-check -->
      <path d="M8 2v3" />
      <path d="M16 2v3" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="m9 15 2 2 4-4" />
    {:else if kind === 'exploration'}
      <!-- lucide/compass -->
      <circle cx="12" cy="12" r="10" />
      <path
        d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"
      />
    {:else if kind === 'knowledge'}
      <!-- lucide/message-square-quote -->
      <path d="M14 14a2 2 0 0 0 2-2V8h-2" />
      <path
        d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
      />
      <path d="M8 14a2 2 0 0 0 2-2V8H8" />
    {:else if kind === 'contribution'}
      <!-- lucide/sprout -->
      <path
        d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"
      />
      <path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4" />
      <path d="M5 21h14" />
    {:else if kind === 'recognition'}
      <!-- lucide/award -->
      <path
        d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"
      />
      <circle cx="12" cy="8" r="6" />
    {:else}
      <!-- lucide/map-pin-check -->
      <path
        d="M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728"
      />
      <circle cx="12" cy="10" r="3" />
      <path d="m16 18 2 2 4-4" />
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
    width: 60%;
    height: 60%;
  }

  path,
  circle,
  rect {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
