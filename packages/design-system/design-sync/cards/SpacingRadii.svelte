<script lang="ts">
  interface TokenRow {
    name: string;
    value: string;
  }

  interface Props {
    space: TokenRow[];
    radii: TokenRow[];
    controlHeight: TokenRow;
  }

  let { space, radii, controlHeight }: Props = $props();
</script>

<div class="dsc-spacing">
  <section>
    <h3>Spacing</h3>
    <div class="rows">
      {#each space as token (token.name)}
        <div class="row">
          <span class="name">{token.name}</span>
          <span class="bar" style="width: {token.value}"></span>
          <span class="value">{token.value}</span>
        </div>
      {/each}
    </div>
  </section>
  <section>
    <h3>Radii</h3>
    <div class="boxes">
      {#each radii as token (token.name)}
        <div class="box-sample">
          <span class="box" style="border-radius: {token.value}"></span>
          <span class="name">{token.name}</span>
          <span class="value">{token.value}</span>
        </div>
      {/each}
    </div>
  </section>
  <section>
    <h3>Control height</h3>
    <div class="box-sample">
      <span class="control-box" style="height: {controlHeight.value}"></span>
      <span class="name">{controlHeight.name}</span>
      <span class="value">{controlHeight.value}</span>
    </div>
  </section>
</div>

<style>
  .dsc-spacing {
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

  .rows {
    display: grid;
    gap: 0.5rem;
  }

  .row {
    display: grid;
    grid-template-columns: 9rem 1fr 6rem;
    align-items: center;
    gap: 0.75rem;
  }

  .bar {
    display: block;
    height: 0.8rem;
    max-width: 100%;
    background: var(--hv-color-fjord);
    border-radius: 999px;
  }

  .boxes,
  .box-sample {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
  }

  .box-sample {
    display: grid;
    justify-items: start;
    gap: 0.3rem;
  }

  .box {
    display: block;
    width: 3.5rem;
    height: 3.5rem;
    background: var(--hv-color-fjord-soft);
    border: 1px solid var(--hv-border-strong);
  }

  .control-box {
    display: block;
    width: 100%;
    max-width: 12rem;
    background: var(--hv-color-fjord-soft);
    border: 1px solid var(--hv-border-strong);
    border-radius: var(--hv-radius-control);
  }

  .name {
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
