import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import { Choice, FormSection } from '@hundavaent/design-system';

// Same rationale as button.browser.test.ts: app.css pulls in tokens.css and the design-system
// utility layer, so computed-style assertions below compare against the live tokens.
import '../../src/app.css';

function label(text: string) {
  return createRawSnippet(() => ({ render: () => text }));
}

function html(markup: string) {
  return createRawSnippet(() => ({ render: () => markup }));
}

// Probe-element token resolution, the button/field.browser.test.ts pattern: parity with the
// token, never a hardcoded literal that drifts when tokens.css changes.
function resolvedProperty(property: string, value: string): string {
  const probe = document.createElement('div');
  probe.style.setProperty(property, value);
  document.body.append(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return resolved;
}

describe('Choice', () => {
  it('renders a radio from its type prop, named from its children', () => {
    render(Choice, { type: 'radio', children: label('First option') });

    const radio = screen.getByRole('radio', { name: 'First option' });
    expect(radio.tagName).toBe('INPUT');
    expect(radio.getAttribute('type')).toBe('radio');
  });

  it('renders a checkbox from its type prop, named from its children', () => {
    render(Choice, { type: 'checkbox', children: label('Notify me') });

    const checkbox = screen.getByRole('checkbox', { name: 'Notify me' });
    expect(checkbox.getAttribute('type')).toBe('checkbox');
  });

  it('reflects an initial checked prop', () => {
    render(Choice, { type: 'checkbox', checked: true, children: label('Already checked') });

    expect(screen.getByRole('checkbox', { name: 'Already checked' })).toHaveProperty(
      'checked',
      true
    );
  });

  it('updates the rendered checked state on a rerender flip', async () => {
    const { rerender } = render(Choice, {
      type: 'checkbox',
      checked: false,
      children: label('Flips')
    });

    expect(screen.getByRole('checkbox', { name: 'Flips' })).toHaveProperty('checked', false);

    await rerender({ type: 'checkbox', checked: true, children: label('Flips') });

    expect(screen.getByRole('checkbox', { name: 'Flips' })).toHaveProperty('checked', true);
  });

  it('spreads name, value, required, and disabled through to the native input', () => {
    render(Choice, {
      type: 'radio',
      name: 'accessArea',
      value: 'front-yard',
      required: true,
      disabled: true,
      children: label('Front yard')
    });

    const radio = screen.getByRole('radio', { name: 'Front yard' }) as HTMLInputElement;
    expect(radio.name).toBe('accessArea');
    expect(radio.value).toBe('front-yard');
    expect(radio.required).toBe(true);
    expect(radio.disabled).toBe(true);
  });

  it('resolves min-height to the control token on the label row', () => {
    render(Choice, { type: 'radio', children: label('Sized') });

    const radio = screen.getByRole('radio', { name: 'Sized' });
    const row = radio.closest('label');
    expect(row).not.toBeNull();
    const style = getComputedStyle(row as Element);
    expect(style.minHeight).toBe(resolvedProperty('min-height', 'var(--hv-control-height)'));
  });

  it('resolves font-weight to 800 on the label row, matching .choice', () => {
    render(Choice, { type: 'radio', children: label('Weighted') });

    const radio = screen.getByRole('radio', { name: 'Weighted' });
    const row = radio.closest('label');
    expect(getComputedStyle(row as Element).fontWeight).toBe('800');
  });

  it('merges a caller class onto the label row, appended last', () => {
    render(Choice, { type: 'radio', class: 'call-site-hook', children: label('Hooked') });

    const radio = screen.getByRole('radio', { name: 'Hooked' });
    const row = radio.closest('label') as Element;
    const classes = row.className.trim().split(/\s+/);
    expect(classes.at(-1)).toBe('call-site-hook');
  });
});

describe('FormSection', () => {
  it('renders a fieldset', () => {
    render(FormSection, { children: html('<p>Body</p>') });

    expect(screen.getByRole('group').tagName).toBe('FIELDSET');
  });

  it('renders the legend as the fieldset accessible name', () => {
    render(FormSection, { legend: 'Welcome area', children: html('<p>Body</p>') });

    expect(screen.getByRole('group', { name: 'Welcome area' })).not.toBeUndefined();
  });

  it('renders no legend element when legend is absent', () => {
    render(FormSection, { children: html('<p>Body</p>') });

    expect(screen.getByRole('group').querySelector('legend')).toBeNull();
  });

  // The nested input's own `disabled` IDL property only reflects its own `disabled` attribute,
  // never an ancestor fieldset's cascaded state - a native <fieldset disabled> makes descendants
  // "actually disabled" (matches :disabled, rejects focus and input) without ever writing a
  // `disabled` attribute onto them. The :disabled pseudo-class match is therefore the correct
  // thing to assert here, not the IDL property.
  it('disables a nested control when disabled is set, the shipped disable-gate pattern', () => {
    render(FormSection, {
      disabled: true,
      children: html('<input type="text" aria-label="Nested control" />')
    });

    expect(
      screen.getByRole('textbox', { name: 'Nested control' }).matches(':disabled')
    ).toBe(true);
  });

  it('leaves a nested control enabled when disabled is absent', () => {
    render(FormSection, {
      children: html('<input type="text" aria-label="Nested control" />')
    });

    expect(
      screen.getByRole('textbox', { name: 'Nested control' }).matches(':disabled')
    ).toBe(false);
  });

  it('resolves background-color to the raised-surface token', () => {
    render(FormSection, { children: html('<p>Body</p>') });

    const style = getComputedStyle(screen.getByRole('group'));
    expect(style.backgroundColor).toBe(
      resolvedProperty('background-color', 'var(--hv-color-snow-raised)')
    );
  });

  it('resolves border-radius to the panel token', () => {
    render(FormSection, { children: html('<p>Body</p>') });

    const style = getComputedStyle(screen.getByRole('group'));
    expect(style.borderRadius).toBe(resolvedProperty('border-radius', 'var(--hv-radius-panel)'));
  });

  it('resolves gap to the panel spacing token', () => {
    render(FormSection, { children: html('<p>Body</p>') });

    const style = getComputedStyle(screen.getByRole('group'));
    expect(style.gap).toBe(resolvedProperty('gap', 'var(--hv-space-panel)'));
  });

  it('merges a caller class alongside its own generated classes, appended last', () => {
    render(FormSection, { class: 'call-site-hook', children: html('<p>Body</p>') });

    const classes = screen.getByRole('group').className.trim().split(/\s+/);
    expect(classes).toContain('rounded-panel');
    expect(classes.at(-1)).toBe('call-site-hook');
  });
});
