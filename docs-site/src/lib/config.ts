export interface DocsConfig {
  name: string;
  description: string;
  content: string;
  nav: {
    links: Array<{ text: string; url: string }>;
  };
}
