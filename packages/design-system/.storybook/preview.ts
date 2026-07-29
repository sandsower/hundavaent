import './preview.css';

import type { Preview } from '@storybook/svelte-vite';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'snow',
      // Storybook's backgrounds addon needs a literal colour, not a var() reference, so this
      // mirrors --hv-color-snow (tokens.css) by hand. Grep for --hv-color-snow if that token's
      // value ever changes, and update this literal to match.
      values: [{ name: 'snow', value: '#edf8fb' }]
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i
      }
    }
  }
};

export default preview;
