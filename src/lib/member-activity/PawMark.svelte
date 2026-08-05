<script lang="ts">
  interface Props {
    active?: boolean;
    class?: string;
  }

  let { active = false, class: className = '' }: Props = $props();
</script>

<svg
  class={`paw-mark block fill-transparent stroke-current stroke-[1.35] [&.active]:fill-current ${className}`}
  class:active
  viewBox="0 0 32 32"
  aria-hidden="true"
  focusable="false"
>
  <ellipse cx="16" cy="20.2" rx="7.6" ry="6.5" transform="rotate(-4 16 20.2)" />
  <ellipse cx="6.8" cy="13.7" rx="3.2" ry="4.1" transform="rotate(-24 6.8 13.7)" />
  <ellipse cx="12.6" cy="8.2" rx="3.1" ry="4.1" transform="rotate(-8 12.6 8.2)" />
  <ellipse cx="19.6" cy="7.9" rx="3.1" ry="4.1" transform="rotate(9 19.6 7.9)" />
  <ellipse cx="25.2" cy="13.6" rx="3.2" ry="4.1" transform="rotate(24 25.2 13.6)" />
</svg>
