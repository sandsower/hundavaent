<script lang="ts">
  interface TokenRow {
    name: string;
    value: string;
  }

  interface Props {
    motion: TokenRow[];
  }

  let { motion }: Props = $props();
</script>

<div class="dsc-motion">
  <table>
    <thead>
      <tr>
        <th>Token</th>
        <th>Value</th>
      </tr>
    </thead>
    <tbody>
      {#each motion as token (token.name)}
        <tr>
          <td>{token.name}</td>
          <td>{token.value}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="note">
    Every --hv-motion-* and --hv-fade-* value collapses to 0ms under prefers-reduced-motion: reduce.
    --hv-motion-ambient is the deliberate exception - ambient scenery switches off via animation:
    none instead of a zero duration.
  </p>
</div>

<style>
  .dsc-motion {
    display: grid;
    gap: 1rem;
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  th,
  td {
    text-align: left;
    padding: 0.4rem 0.75rem 0.4rem 0;
    border-bottom: 1px solid var(--hv-border-subtle);
    font-size: 0.85rem;
  }

  th {
    font-weight: 800;
    color: var(--hv-color-basalt-muted);
    text-transform: uppercase;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
  }

  td {
    color: var(--hv-color-basalt);
    font-family: ui-monospace, monospace;
  }

  td:first-child {
    font-family: inherit;
    font-weight: 700;
  }

  .note {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--hv-color-basalt-muted);
  }
</style>
