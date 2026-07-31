<script lang="ts">
  import Field from '../../src/lib/Field.svelte';
  import Select from '../../src/lib/Select.svelte';
  import Textarea from '../../src/lib/Textarea.svelte';
</script>

<div class="dsc-col">
  <Field label="Access type" hint="Choose the closest match.">
    <Select value="on-lead">
      <option value="off-lead">Off-lead area</option>
      <option value="on-lead">On-lead area</option>
      <option value="seasonal">Seasonal restriction</option>
    </Select>
  </Field>
  <Field label="Notes for other members" hint="Optional - visible on the place page.">
    <Textarea placeholder="The gate sticks a little; lift as you pull." />
  </Field>
</div>

<style>
  .dsc-col {
    display: grid;
    gap: var(--hv-space-panel);
    max-width: 24rem;
  }
</style>
