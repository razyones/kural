import type { DocsConfig } from './src/lib/config';

const config: DocsConfig = {
  name: 'Kural',
  description:
    'Structural scoring system for TypeScript codebases — answers "where should this code live?"',
  content: '../docs',
  nav: {
    links: [
      { text: 'GitHub', url: 'https://github.com/user/kural' },
    ],
  },
};

export default config;
