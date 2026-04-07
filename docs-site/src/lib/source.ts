import { loader } from "fumadocs-core/source";
import type { InferPageType } from "fumadocs-core/source";
import { docs } from "collections/server";
import { icons } from "lucide-react";
import { createElement } from "react";

const base = (process.env.BASE_PATH ?? "/").replace(/\/$/, "");

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: `${base}/docs`,
  icon: (name) => {
    if (!name || !(name in icons)) {
      return;
    }
    return createElement(icons[name as keyof typeof icons], { strokeWidth: 1 });
  },
});

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText("processed");
  return `# ${page.data.title} (${page.url})\n\n${processed}`;
}
