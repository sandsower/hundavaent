<script lang="ts">
  import Choice from '../../src/lib/Choice.svelte';
  import FormSection from '../../src/lib/FormSection.svelte';
</script>

<FormSection legend="Access details">
  <Choice type="radio" name="dsc-lead-status" checked={true}>On lead</Choice>
  <Choice type="radio" name="dsc-lead-status" checked={false}>Off lead</Choice>
  <Choice type="checkbox" checked={true}>Water available on site</Choice>
</FormSection>
