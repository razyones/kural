import { defineDocs, defineConfig } from 'fumadocs-mdx/config';
import docsConfig from './docs.config';

export const docs = defineDocs({
  dir: docsConfig.content,
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig();
