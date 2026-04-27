export interface DocsConfig {
  name: string;
  description: string;
  url: string;
  content: string;
  repo: { url: string; branch: string };
  nav: {
    links: Array<{ text: string; url: string }>;
  };
}
