import { Input } from '@hundavaent/design-system';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import FieldHarness from './fixtures/FieldHarness.svelte';

// Same rationale as button.browser.test.ts: app.css pulls in tokens.css and the design-system
// utility layer, so computed-style assertions below compare against the live tokens.
import '../../src/app.css';

// Probe-element token resolution, the button.browser.test.ts pattern: parity with the token,
// never a hardcoded literal that drifts when tokens.css changes.
function resolvedProperty(property: string, value: string): string {
  const probe = document.createElement('div');
  probe.style.setProperty(property, value);
  document.body.append(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return resolved;
}

describe('Field', () => {
  it('associates its label with the wrapped control via for/id', () => {
    render(FieldHarness, { label: 'Name of the place' });

    const input = screen.getByLabelText('Name of the place');
    expect(input.tagName).toBe('INPUT');
    expect(input.id).not.toBe('');
    expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
  });

  it('carries no aria-describedby and no aria-invalid when there is neither hint nor error', () => {
    render(FieldHarness, { label: 'Plain' });

    const input = screen.getByLabelText('Plain');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('points aria-describedby at the rendered hint', () => {
    render(FieldHarness, { label: 'Phone', hint: 'Icelandic numbers only' });

    const input = screen.getByLabelText('Phone');
    const describedby = input.getAttribute('aria-describedby');
    expect(describedby).not.toBeNull();
    const hint = document.getElementById(describedby ?? '');
    expect(hint?.textContent).toBe('Icelandic numbers only');
  });

  it('renders an error wired through both aria-describedby and aria-invalid', () => {
    render(FieldHarness, { label: 'Email', error: 'Enter a valid email address' });

    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/);
    const error = ids.map((id) => document.getElementById(id)).find((el) => el !== null);
    expect(error?.textContent).toBe('Enter a valid email address');
  });

  it('chains hint before error in aria-describedby when both render', () => {
    render(FieldHarness, {
      label: 'Email',
      hint: 'We only use this to sign you in',
      error: 'Enter a valid email address'
    });

    const input = screen.getByLabelText('Email');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(ids).toHaveLength(2);
    const [hintText, errorText] = ids.map((id) => document.getElementById(id)?.textContent);
    expect(hintText).toBe('We only use this to sign you in');
    expect(errorText).toBe('Enter a valid email address');
  });

  it('renders the error in the danger ink', () => {
    render(FieldHarness, { label: 'Email', error: 'Enter a valid email address' });

    const input = screen.getByLabelText('Email');
    const errorId = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).at(-1) ?? '';
    const error = document.getElementById(errorId);
    expect(error).not.toBeNull();
    expect(getComputedStyle(error as Element).color).toBe(
      resolvedProperty('color', 'var(--hv-color-danger)')
    );
  });

  it('merges a caller-supplied aria-describedby after the field-provided ids', async () => {
    const external = document.createElement('p');
    external.id = 'external-note';
    document.body.append(external);

    render(FieldHarness, {
      label: 'Pin',
      hint: 'Drop the pin on the entrance',
      inputProps: { 'aria-describedby': 'external-note' }
    });

    const ids = (screen.getByLabelText('Pin').getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(ids).toHaveLength(2);
    expect(ids.at(-1)).toBe('external-note');
    expect(document.getElementById(ids[0])?.textContent).toBe('Drop the pin on the entrance');

    external.remove();
  });

  it('updates the wiring when an error appears after render', async () => {
    const { rerender } = render(FieldHarness, { label: 'Email' });

    expect(screen.getByLabelText('Email').hasAttribute('aria-invalid')).toBe(false);

    await rerender({ label: 'Email', error: 'Enter a valid email address' });

    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('merges a caller class onto the stack, appended last', () => {
    render(FieldHarness, { label: 'Hooked', fieldClass: 'call-site-hook' });

    const stack = screen.getByLabelText('Hooked').closest('.call-site-hook');
    expect(stack).not.toBeNull();
    const classes = (stack as Element).className.trim().split(/\s+/);
    expect(classes.at(-1)).toBe('call-site-hook');
  });
});

describe('Input', () => {
  it('renders standalone without any field wiring', () => {
    render(Input, { name: 'search', 'aria-label': 'Search places' });

    const input = screen.getByRole('textbox', { name: 'Search places' });
    expect(input.hasAttribute('id')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('keeps a caller-supplied id when used standalone', () => {
    render(Input, { id: 'caller-id', 'aria-label': 'Named' });

    expect(screen.getByRole('textbox', { name: 'Named' }).id).toBe('caller-id');
  });

  it('resolves min-height, border-radius, and background to the field tokens', () => {
    render(Input, { 'aria-label': 'Sized' });

    const style = getComputedStyle(screen.getByRole('textbox', { name: 'Sized' }));
    expect(style.minHeight).toBe(resolvedProperty('min-height', 'var(--hv-control-height)'));
    expect(style.borderRadius).toBe(resolvedProperty('border-radius', 'var(--hv-radius-control)'));
    expect(style.backgroundColor).toBe(
      resolvedProperty('background-color', 'var(--hv-color-snow-raised)')
    );
  });

  it('spans the full width of its container like .hv-field', () => {
    render(Input, { 'aria-label': 'Wide' });

    const input = screen.getByRole('textbox', { name: 'Wide' });
    expect(getComputedStyle(input).width).toBe(getComputedStyle(document.body).width);
  });

  it('passes disabled through to the native input', () => {
    render(Input, { disabled: true, 'aria-label': 'Unavailable' });

    expect(screen.getByRole('textbox', { name: 'Unavailable' }).hasAttribute('disabled')).toBe(
      true
    );
  });

  it('merges a caller class alongside its generated classes, appended last', () => {
    render(Input, { class: 'call-site-hook', 'aria-label': 'Glued' });

    const classes = screen.getByRole('textbox', { name: 'Glued' }).className.trim().split(/\s+/);
    expect(classes).toContain('rounded-control');
    expect(classes.at(-1)).toBe('call-site-hook');
  });
});
