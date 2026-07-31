<!-- Same components, same utility classes, two `data-ui-mode` scopes side by side - the retune is
     entirely token-driven (tokens.css's [data-ui-mode='operations'] block), so nothing in either
     column's markup differs. -->
<script lang="ts">
  import Button from '../../src/lib/Button.svelte';
  import Input from '../../src/lib/Input.svelte';
  import Panel from '../../src/lib/Panel.svelte';
</script>

<div class="dsc-modes">
  <div class="dsc-mode-column">
    <p class="dsc-mode-label">Member (default)</p>
    <Panel padded>
      <div class="dsc-row">
        <Button intent="primary">Approve</Button>
        <Button intent="quiet">Skip</Button>
      </div>
      <Input placeholder="Reviewer note" />
    </Panel>
  </div>
  <div class="dsc-mode-column" data-ui-mode="operations">
    <p class="dsc-mode-label">Operations</p>
    <Panel padded>
      <div class="dsc-row">
        <Button intent="primary">Approve</Button>
        <Button intent="quiet">Skip</Button>
      </div>
      <Input placeholder="Reviewer note" />
    </Panel>
  </div>
</div>

<style>
  .dsc-modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .dsc-mode-label {
    margin: 0 0 0.5rem;
    font-weight: 800;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--hv-color-basalt-muted);
  }

  .dsc-row {
    display: flex;
    gap: var(--hv-space-actions);
    margin-bottom: var(--hv-space-panel);
  }
</style>
