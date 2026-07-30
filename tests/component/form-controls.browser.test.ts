import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import { Select, Textarea } from '@hundavaent/design-system';

import SelectFieldHarness from './fixtures/SelectFieldHarness.svelte';
import TextareaFieldHarness from './fixtures/TextareaFieldHarness.svelte';

// Same rationale as field.browser.test.ts: app.css pulls in tokens.css and the design-system
// utility layer, so computed-style assertions below compare against the live tokens.
import '../../src/app.css';

// Probe-element token resolution, the field.browser.test.ts / button.browser.test.ts pattern:
// parity with the token, never a hardcoded literal that drifts when tokens.css changes.
function resolvedProperty(property: string, value: string): string {
  const probe = document.createElement('div');
  probe.style.setProperty(property, value);
  document.body.append(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return resolved;
}

// Select's children prop is required, and a direct render() call here has no Svelte parent
// markup to write literal <option> tags into - createRawSnippet is the escape hatch the other
// suites already use for plain HTML (see button.browser.test.ts's label() helper). Wrapped in a
// single <optgroup> rather than two sibling <option>s: createRawSnippet's render function must
// return HTML for a single root element, and an optgroup is a legitimate, semantics-preserving
// single root for a select's options.
function fruitOptions() {
  return createRawSnippet(() => ({
    render: () =>
      '<optgroup label="Fruit"><option value="apple">Apple</option><option value="banana">Banana</option></optgroup>'
  }));
}

describe('Textarea', () => {
  describe('inside a Field', () => {
    it('associates its label with the wrapped control via for/id', () => {
      render(TextareaFieldHarness, { label: 'Notes' });

      const textarea = screen.getByLabelText('Notes');
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea.id).not.toBe('');
      expect(document.querySelector(`label[for="${textarea.id}"]`)).not.toBeNull();
    });

    it('points aria-describedby at the rendered hint', () => {
      render(TextareaFieldHarness, { label: 'Notes', hint: 'Keep it short' });

      const textarea = screen.getByLabelText('Notes');
      const describedby = textarea.getAttribute('aria-describedby');
      expect(describedby).not.toBeNull();
      expect(document.getElementById(describedby ?? '')?.textContent).toBe('Keep it short');
    });

    it('renders an error wired through both aria-describedby and aria-invalid', () => {
      render(TextareaFieldHarness, { label: 'Notes', error: 'Say more' });

      const textarea = screen.getByLabelText('Notes');
      expect(textarea.getAttribute('aria-invalid')).toBe('true');
      const ids = (textarea.getAttribute('aria-describedby') ?? '').split(/\s+/);
      const error = ids.map((id) => document.getElementById(id)).find((el) => el !== null);
      expect(error?.textContent).toBe('Say more');
    });
  });

  describe('standalone', () => {
    it('renders without any field wiring', () => {
      render(Textarea, { name: 'notes', 'aria-label': 'Notes' });

      const textarea = screen.getByRole('textbox', { name: 'Notes' });
      expect(textarea.hasAttribute('id')).toBe(false);
      expect(textarea.hasAttribute('aria-describedby')).toBe(false);
      expect(textarea.hasAttribute('aria-invalid')).toBe(false);
    });

    it('keeps a caller-supplied id when used standalone', () => {
      render(Textarea, { id: 'caller-id', 'aria-label': 'Named' });

      expect(screen.getByRole('textbox', { name: 'Named' }).id).toBe('caller-id');
    });
  });

  describe('styling', () => {
    it('resolves border-radius and background to the field tokens', () => {
      render(Textarea, { 'aria-label': 'Sized' });

      const style = getComputedStyle(screen.getByRole('textbox', { name: 'Sized' }));
      expect(style.borderRadius).toBe(
        resolvedProperty('border-radius', 'var(--hv-radius-control)')
      );
      expect(style.backgroundColor).toBe(
        resolvedProperty('background-color', 'var(--hv-color-snow-raised)')
      );
    });

    it('sets a 6rem minimum height instead of the single-line control height', () => {
      render(Textarea, { 'aria-label': 'Tall' });

      const style = getComputedStyle(screen.getByRole('textbox', { name: 'Tall' }));
      expect(style.minHeight).toBe('96px');
    });

    it('allows vertical resize', () => {
      render(Textarea, { 'aria-label': 'Resizable' });

      const style = getComputedStyle(screen.getByRole('textbox', { name: 'Resizable' }));
      expect(style.resize).toBe('vertical');
    });
  });

  it('merges a caller class alongside its generated classes, appended last', () => {
    render(Textarea, { class: 'call-site-hook', 'aria-label': 'Glued' });

    const classes = screen.getByRole('textbox', { name: 'Glued' }).className.trim().split(/\s+/);
    expect(classes).toContain('rounded-control');
    expect(classes.at(-1)).toBe('call-site-hook');
  });

  it('renders a bound value as its text content', () => {
    render(Textarea, { 'aria-label': 'Bio', value: 'Loves maps' });

    expect(screen.getByRole('textbox', { name: 'Bio' })).toHaveValue('Loves maps');
  });
});

describe('Select', () => {
  describe('inside a Field', () => {
    it('associates its label with the wrapped control via for/id', () => {
      render(SelectFieldHarness, { label: 'Fruit' });

      const select = screen.getByLabelText('Fruit');
      expect(select.tagName).toBe('SELECT');
      expect(select.id).not.toBe('');
      expect(document.querySelector(`label[for="${select.id}"]`)).not.toBeNull();
    });

    it('points aria-describedby at the rendered hint', () => {
      render(SelectFieldHarness, { label: 'Fruit', hint: 'Pick one' });

      const select = screen.getByLabelText('Fruit');
      const describedby = select.getAttribute('aria-describedby');
      expect(describedby).not.toBeNull();
      expect(document.getElementById(describedby ?? '')?.textContent).toBe('Pick one');
    });

    it('renders an error wired through both aria-describedby and aria-invalid', () => {
      render(SelectFieldHarness, { label: 'Fruit', error: 'Choose a fruit' });

      const select = screen.getByLabelText('Fruit');
      expect(select.getAttribute('aria-invalid')).toBe('true');
      const ids = (select.getAttribute('aria-describedby') ?? '').split(/\s+/);
      const error = ids.map((id) => document.getElementById(id)).find((el) => el !== null);
      expect(error?.textContent).toBe('Choose a fruit');
    });
  });

  describe('standalone', () => {
    it('renders without any field wiring', () => {
      render(Select, { name: 'fruit', 'aria-label': 'Fruit', children: fruitOptions() });

      const select = screen.getByRole('combobox', { name: 'Fruit' });
      expect(select.hasAttribute('id')).toBe(false);
      expect(select.hasAttribute('aria-describedby')).toBe(false);
      expect(select.hasAttribute('aria-invalid')).toBe(false);
    });

    it('keeps a caller-supplied id when used standalone', () => {
      render(Select, { id: 'caller-id', 'aria-label': 'Named', children: fruitOptions() });

      expect(screen.getByRole('combobox', { name: 'Named' }).id).toBe('caller-id');
    });
  });

  describe('styling', () => {
    it('resolves min-height, border-radius, and background to the field tokens', () => {
      render(Select, { 'aria-label': 'Sized', children: fruitOptions() });

      const style = getComputedStyle(screen.getByRole('combobox', { name: 'Sized' }));
      expect(style.minHeight).toBe(resolvedProperty('min-height', 'var(--hv-control-height)'));
      expect(style.borderRadius).toBe(
        resolvedProperty('border-radius', 'var(--hv-radius-control)')
      );
      expect(style.backgroundColor).toBe(
        resolvedProperty('background-color', 'var(--hv-color-snow-raised)')
      );
    });
  });

  it('merges a caller class alongside its generated classes, appended last', () => {
    render(Select, { class: 'call-site-hook', 'aria-label': 'Glued', children: fruitOptions() });

    const classes = screen.getByRole('combobox', { name: 'Glued' }).className.trim().split(/\s+/);
    expect(classes).toContain('rounded-control');
    expect(classes.at(-1)).toBe('call-site-hook');
  });

  it('selects the option matching a bound value', () => {
    render(Select, { 'aria-label': 'Fruit', value: 'banana', children: fruitOptions() });

    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveValue('banana');
  });
});
