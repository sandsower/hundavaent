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
    onSelect(next);
    const group = (event.currentTarget as HTMLElement).closest('[role="radiogroup"]');
    const buttons = group?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next - 1]?.focus();
  }
</script>

<div class="star-rating" role="radiogroup" aria-label={label} data-inherited={inherited}>
  {#each [1, 2, 3, 4, 5] as score (score)}
    <button
      type="button"
      role="radio"
      aria-label={scoreLabel(score)}
      aria-checked={value === score}
      tabindex={value === score || (value === null && score === 1) ? 0 : -1}
      {disabled}
      onclick={() => onSelect(score)}
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
