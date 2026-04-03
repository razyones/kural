import defaultMdxComponents from "fumadocs-ui/mdx";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import type { MDXComponents } from "mdx/types";

const defaultComponents = {
  ...defaultMdxComponents,
  Accordion,
  Accordions,
  Callout,
  Card,
  Cards,
  Step,
  Steps,
  Tab,
  Tabs,
} satisfies MDXComponents;

export function getMDXComponents(components?: MDXComponents) {
  if (!components) {
    return defaultComponents;
  }
  return { ...defaultComponents, ...components } satisfies MDXComponents;
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
