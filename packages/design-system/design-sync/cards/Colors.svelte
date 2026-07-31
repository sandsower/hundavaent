<script lang="ts">
  interface Swatch {
    name: string;
    value: string;
  }

  interface Props {
    colors: Swatch[];
    access: Swatch[];
  }

  let { colors, access }: Props = $props();
</script>

<div class="dsc-colors">
  <section>
    <h3>Palette</h3>
    <div class="swatch-grid">
      {#each colors as swatch (swatch.name)}
        <div class="swatch">
          <span class="chip" style="background: {swatch.value}"></span>
          <span class="label">{swatch.name}</span>
          <span class="value">{swatch.value}</span>
        </div>
      {/each}
    </div>
  </section>
  <section>
    <h3>Access symbols</h3>
    <div class="swatch-grid">
      {#each access as swatch (swatch.name)}
        <div class="swatch">
          <span class="chip" style="background: {swatch.value}"></span>
          <span class="label">{swatch.name}</span>
          <span class="value">{swatch.value}</span>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .dsc-colors {
    display: grid;
    gap: 1.5rem;
  }

  h3 {
    margin: 0 0 0.75rem;
    font-size: 0.8rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--hv-color-basalt-muted);
  }

  .swatch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
    gap: 0.75rem;
  }

  .swatch {
    display: grid;
    gap: 0.35rem;
  }

  .chip {
    display: block;
    width: 100%;
    height: 2.75rem;
    border-radius: var(--hv-radius-panel);
    border: 1px solid var(--hv-border-subtle);
  }

  .label {
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--hv-color-basalt);
  }

  .value {
    font-size: 0.72rem;
    color: var(--hv-color-basalt-muted);
    font-family: ui-monospace, monospace;
  }
</style>
