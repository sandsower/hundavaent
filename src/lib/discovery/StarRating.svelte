<script lang="ts">
  interface Props {
    label: string;
    value: number | null;
    inherited?: boolean;
    disabled?: boolean;
    onSelect: (value: number) => void;
  }

  let { label, value, inherited = false, disabled = false, onSelect }: Props = $props();

  function move(event: KeyboardEvent, score: number): void {
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1;
    onSelect(Math.min(5, Math.max(1, score + delta)));
  }
</script>

<div class="star-rating" role="radiogroup" aria-label={label} data-inherited={inherited}>
  {#each [1, 2, 3, 4, 5] as score (score)}
    <button
      type="button"
      role="radio"
      aria-label={`${score} ${score === 1 ? 'star' : 'stars'}`}
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
    color: var(--hv-color-signal-strong, #9b6500);
    font-size: 1.45rem;
    line-height: 1;
    cursor: pointer;
    place-items: center;
  }
  [data-inherited='true'] button {
    opacity: 0.62;
  }
  button:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 1px;
  }
</style>
