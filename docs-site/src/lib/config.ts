export interface DocsConfig {
  name: string;
  description: string;
  url: string;
  content: string;
  nav: {
    links: Array<{ text: string; url: string }>;
  };
}
