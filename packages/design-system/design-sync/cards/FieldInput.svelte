<script lang="ts">
  import Field from '../../src/lib/Field.svelte';
  import Input from '../../src/lib/Input.svelte';
</script>

<div class="dsc-col">
  <Field label="Place name" hint="Shown to other members exactly as typed.">
    <Input placeholder="Hundahólmi" />
  </Field>
  <Field label="Place name" error="A place with this name already exists nearby.">
    <Input value="Grænisandur" />
  </Field>
</div>

<style>
  .dsc-col {
    display: grid;
    gap: var(--hv-space-panel);
    max-width: 24rem;
  }
</style>
