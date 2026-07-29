import './preview.css';

import type { Preview } from '@storybook/svelte-vite';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'snow',
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
