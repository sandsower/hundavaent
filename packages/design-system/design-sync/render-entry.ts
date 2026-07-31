// Loaded via vite's ssrLoadModule (see build.ts) rather than imported by a normal Node entry
// point, so relative imports here resolve through vite's own resolver - the same .svelte-with-
// extension / .ts-referenced-as-.js conventions the package's own src/lib files already use.

import { render } from 'svelte/server';

import ButtonIntents from './cards/ButtonIntents.svelte';
import ButtonShapesStates from './cards/ButtonShapesStates.svelte';
import ChoiceFormSection from './cards/ChoiceFormSection.svelte';
import Colors from './cards/Colors.svelte';
import DialogCard from './cards/DialogCard.svelte';
import DisclosureRating from './cards/DisclosureRating.svelte';
import FieldInput from './cards/FieldInput.svelte';
import Motion from './cards/Motion.svelte';
import NoticeTones from './cards/NoticeTones.svelte';
import OperationsMode from './cards/OperationsMode.svelte';
import PageScaffold from './cards/PageScaffold.svelte';
import SelectTextarea from './cards/SelectTextarea.svelte';
import SpacingRadii from './cards/SpacingRadii.svelte';
import StatusTones from './cards/StatusTones.svelte';
import Type from './cards/Type.svelte';
import { readColorSwatches, readMotionTokens, readSpacingAndRadii } from './tokens.js';

export interface RenderedCard {
  slug: string;
  group: string;
  name: string;
  subtitle: string;
  viewportWidth: number;
  uiMode: 'member' | 'operations';
  headHtml: string;
  bodyHtml: string;
}

interface CardEntry {
  slug: string;
  group: string;
  name: string;
  subtitle: string;
  viewportWidth: number;
  uiMode?: 'member' | 'operations';
  // Every card component carries its own distinct Props interface, and this list has to hold all
  // of them at once - a real union would have to be threaded through every entry below for no
  // behavioural benefit, since `props` always matches whichever `component` sits next to it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: any;
  props: Record<string, unknown>;
}

export async function renderCards(): Promise<RenderedCard[]> {
  const colorSwatches = readColorSwatches();
  const spacingRadii = readSpacingAndRadii();
  const motionTokens = readMotionTokens();

  const entries: CardEntry[] = [
    {
      slug: 'colors',
      group: 'Foundations',
      name: 'Colors',
      subtitle: 'Palette and access-symbol tokens',
      viewportWidth: 900,
      component: Colors,
      props: colorSwatches
    },
    {
      slug: 'type',
      group: 'Foundations',
      name: 'Type',
      subtitle: 'Display and UI type specimens',
      viewportWidth: 700,
      component: Type,
      props: {}
    },
    {
      slug: 'spacing-radii',
      group: 'Foundations',
      name: 'Spacing and radii',
      subtitle: 'Space, radius, and control-height tokens',
      viewportWidth: 700,
      component: SpacingRadii,
      props: spacingRadii
    },
    {
      slug: 'motion',
      group: 'Foundations',
      name: 'Motion',
      subtitle: 'Motion and fade timing tokens',
      viewportWidth: 700,
      component: Motion,
      props: { motion: motionTokens }
    },
    {
      slug: 'button-intents',
      group: 'Buttons',
      name: 'Button intents',
      subtitle: 'All six intent treatments',
      viewportWidth: 700,
      component: ButtonIntents,
      props: {}
    },
    {
      slug: 'button-shapes-states',
      group: 'Buttons',
      name: 'Button shapes and states',
      subtitle: 'Round shape, disabled, pressed, and link form',
      viewportWidth: 700,
      component: ButtonShapesStates,
      props: {}
    },
    {
      slug: 'field-input',
      group: 'Forms',
      name: 'Field and Input',
      subtitle: 'Label, hint, and error states',
      viewportWidth: 500,
      component: FieldInput,
      props: {}
    },
    {
      slug: 'select-textarea',
      group: 'Forms',
      name: 'Select and Textarea',
      subtitle: 'Field-wrapped select and multi-line input',
      viewportWidth: 500,
      component: SelectTextarea,
      props: {}
    },
    {
      slug: 'choice-formsection',
      group: 'Forms',
      name: 'Choice and FormSection',
      subtitle: 'Radio and checkbox rows inside a fieldset',
      viewportWidth: 500,
      component: ChoiceFormSection,
      props: {}
    },
    {
      slug: 'notice',
      group: 'Feedback',
      name: 'Notice',
      subtitle: 'Every tone Notice supports',
      viewportWidth: 600,
      component: NoticeTones,
      props: {}
    },
    {
      slug: 'status',
      group: 'Feedback',
      name: 'Status',
      subtitle: 'Every tone Status supports',
      viewportWidth: 600,
      component: StatusTones,
      props: {}
    },
    {
      slug: 'dialog',
      group: 'Overlay',
      name: 'Dialog',
      subtitle: 'Standard size, a title, and an action row',
      viewportWidth: 600,
      component: DialogCard,
      props: {}
    },
    {
      slug: 'page-scaffold',
      group: 'Layout',
      name: 'Page scaffold',
      subtitle: 'PageShell, PageHeader, and Panel composed together',
      viewportWidth: 900,
      component: PageScaffold,
      props: {}
    },
    {
      slug: 'disclosure-rating',
      group: 'Structure',
      name: 'Disclosure and Rating',
      subtitle: 'Expand and collapse, and star selection at a few values',
      viewportWidth: 600,
      component: DisclosureRating,
      props: {}
    },
    {
      slug: 'operations-mode',
      group: 'Modes',
      name: 'Operations mode',
      subtitle: 'The same utilities retuned under data-ui-mode operations',
      viewportWidth: 900,
      component: OperationsMode,
      props: {}
    }
  ];

  return entries.map((entry) => {
    const rendered = render(entry.component, { props: entry.props });
    return {
      slug: entry.slug,
      group: entry.group,
      name: entry.name,
      subtitle: entry.subtitle,
      viewportWidth: entry.viewportWidth,
      uiMode: entry.uiMode ?? 'member',
      headHtml: rendered.head,
      bodyHtml: rendered.body
    };
  });
}
