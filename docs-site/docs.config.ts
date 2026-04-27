import type { DocsConfig } from "./src/lib/config";

const REPO_URL = "https://github.com/razyones/kural";
const DEFAULT_BRANCH = "alpha";
// Replaced by Vite `define` at bundle time so client code reads the build's branch.
const REPO_BRANCH = process.env.DOCS_BRANCH ?? DEFAULT_BRANCH;

const config: DocsConfig = {
  name: "Kural",
  description: 'Structural discipline for codebases — answers "where should this code live?"',
  url: "https://razyones.github.io/kural",
  content: "../docs",
  repo: { url: REPO_URL, branch: REPO_BRANCH },
  nav: {
    links: [{ text: "GitHub", url: REPO_URL }],
  },
};

export default config;
