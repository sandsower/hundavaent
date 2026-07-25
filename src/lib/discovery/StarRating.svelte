<script lang="ts">
  interface Props {
    label: string;
    value: number | null;
    inherited?: boolean;
    disabled?: boolean;
    onSelect: (value: number) => void;
    scoreLabel: (value: number) => string;
  }

  let { label, value, inherited = false, disabled = false, onSelect, scoreLabel }: Props = $props();

  // The pop belongs to the act of choosing. A score that arrives with the page, or one
  // inherited from another rating, is a fact rather than a moment and must not animate.
  let popPhase = $state<'idle' | 'a' | 'b'>('idle');
  // Deliberately not $state: alternating is bookkeeping for the CSS, and reading a rune here
  // would make the write below re-trigger whatever reads it.
  let alternate = false;

  // Two class names carrying one animation. Re-adding a class an element already has does not
  // restart it, and arrow-key navigation changes the score faster than the cascade finishes,
  // so consecutive choices need a name the element is not already wearing.
  function pop(): void {
    alternate = !alternate;
    popPhase = alternate ? 'a' : 'b';
  }

  function choose(score: number): void {
    pop();
    onSelect(score);
  }

  function move(event: KeyboardEvent, score: number): void {
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 1
        : event.key === 'End'
          ? 5
          : ((score - 1 + (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) + 5) %
              5) +
            1;
    choose(next);
    const group = (event.currentTarget as HTMLElement).closest('[role="radiogroup"]');
    const buttons = group?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next - 1]?.focus();
  }
</script>

<div
  class="star-rating"
  role="radiogroup"
  aria-label={label}
  data-inherited={inherited}
>
  {#each [1, 2, 3, 4, 5] as score (score)}
    <button
      type="button"
      role="radio"
      aria-label={scoreLabel(score)}
      aria-checked={value === score}
      tabindex={value === score || (value === null && score === 1) ? 0 : -1}
      {disabled}
      class:pop-a={popPhase === 'a' && value !== null && score <= value}
      class:pop-b={popPhase === 'b' && value !== null && score <= value}
      style="--star-position: {score - 1}"
      onclick={() => choose(score)}
      onkeydown={(event) => move(event, score)}
    >
      <span aria-hidden="true">{value !== null && score <= value ? '★' : '☆'}</span>
    </button>
  {/each}
</div>

<style>
  .star-rating {
    display: inline-flex;
    gap: 0.08rem;
  }
  button {
    display: grid;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--hv-color-signal-strong);
    font-size: 1.45rem;
    line-height: 1;
    cursor: pointer;
    place-items: center;
  }
  button span {
    transition: transform var(--hv-motion-instant) var(--hv-ease-settle);
  }

  button:not(:disabled):hover span {
    transform: scale(1.12);
  }

  button:not(:disabled):active span {
    transform: scale(0.9);
  }

  /* Left to right, so choosing four stars reads as a sweep filling up rather than as one
     simultaneous jolt. The step is derived from the token rather than picked, which is also
     what collapses the cascade to nothing under reduced motion: at a zero step every star
     starts at once, and at a zero duration none of them move. */
  .pop-a span,
  .pop-b span {
    animation: star-pop var(--hv-motion-quick) var(--hv-ease-overshoot);
    animation-delay: calc(var(--hv-motion-instant) / 2 * var(--star-position));
  }

  @keyframes star-pop {
    0% {
      transform: scale(1);
    }

    45% {
      transform: scale(1.4);
    }

    100% {
      transform: scale(1);
    }
  }

  button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  [data-inherited='true'] button {
    opacity: 0.62;
  }
  button:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 1px;
  }
</style>
