import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

const defaultComponents = {
  ...defaultMdxComponents,
} satisfies MDXComponents;

export function getMDXComponents(components?: MDXComponents) {
  if (!components) return defaultComponents;
  return { ...defaultMdxComponents, ...components } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
