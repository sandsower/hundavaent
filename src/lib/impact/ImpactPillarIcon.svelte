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

<span
  class={`impact-icon ${size} inline-grid flex-none place-items-center ${size === 'large' ? 'w-[3.3rem] h-[3.3rem] rounded-2xl' : 'w-[2.35rem] h-[2.35rem] rounded-[0.75rem]'} bg-[color-mix(in_srgb,_var(--impact-tone,_var(--hv-color-moss))_13%,_white)] text-[color-mix(in_srgb,_var(--impact-tone,_var(--hv-color-moss))_82%,_black)]`}
  data-impact-icon={kind}
  aria-hidden="true"
>
  <svg viewBox="0 0 24 24" role="presentation" class="w-[60%] h-[60%]">
    {#if kind === 'rhythm'}
      <!-- lucide/calendar-check -->
      <path
        d="M8 2v3"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="M16 2v3"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="M3 9h18"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="m9 15 2 2 4-4"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
    {:else if kind === 'exploration'}
      <!-- lucide/compass -->
      <circle
        cx="12"
        cy="12"
        r="10"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
    {:else if kind === 'knowledge'}
      <!-- lucide/message-square-quote -->
      <path
        d="M14 14a2 2 0 0 0 2-2V8h-2"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="M8 14a2 2 0 0 0 2-2V8H8"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
    {:else if kind === 'contribution'}
      <!-- lucide/sprout -->
      <path
        d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="M5 21h14"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
    {:else if kind === 'recognition'}
      <!-- lucide/award -->
      <path
        d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <circle
        cx="12"
        cy="8"
        r="6"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
    {:else}
      <!-- lucide/map-pin-check -->
      <path
        d="M19.43 12.935c.357-.967.57-1.955.57-2.935a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 1.202 0 32.197 32.197 0 0 0 .813-.728"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <circle
        cx="12"
        cy="10"
        r="3"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
      <path
        d="m16 18 2 2 4-4"
        class="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] stroke-2"
      />
    {/if}
  </svg>
</span>
