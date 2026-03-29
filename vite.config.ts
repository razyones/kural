import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "import"],
    categories: {
      correctness: "error",
      suspicious: "warn",
      pedantic: "warn",
    },
    rules: {
      // Magic numbers
      "eslint/no-magic-numbers": "warn",

      // Strict type checking
      "typescript/explicit-function-return-type": "warn",
      "typescript/explicit-module-boundary-types": "warn",
      "typescript/no-explicit-any": "error",
      "typescript/no-non-null-assertion": "warn",
      "typescript/no-empty-object-type": "warn",
      "typescript/no-invalid-void-type": "warn",
      "typescript/no-namespace": "warn",
      "typescript/no-require-imports": "error",
      "typescript/no-var-requires": "error",
      "typescript/no-non-null-asserted-nullish-coalescing": "warn",
      "typescript/no-import-type-side-effects": "warn",
      "typescript/no-dynamic-delete": "warn",
      "typescript/promise-function-async": "warn",
      "typescript/use-unknown-in-catch-callback-variable": "warn",
      "typescript/prefer-literal-enum-member": "warn",
      "typescript/no-unsafe-type-assertion": "warn",

      // Code organization — imports
      "import/no-cycle": "error",
      "import/no-self-import": "error",
      "import/first": "warn",
      "import/no-duplicates": "warn",
      "import/consistent-type-specifier-style": "warn",
      "import/exports-last": "warn",
      "import/no-mutable-exports": "warn",
      "import/no-commonjs": "error",
      "import/no-named-as-default": "warn",
      "import/no-named-as-default-member": "warn",
      "import/no-namespace": "warn",

      // No dynamic imports/requires
      "import/no-dynamic-require": "error",
      "eslint/no-new-func": "warn",

      // General strictness
      "eslint/eqeqeq": "error",
      "eslint/curly": "warn",
      "eslint/no-var": "error",
      "eslint/prefer-const": "warn",
      "eslint/no-duplicate-imports": "off",
      "eslint/sort-imports": "warn",
    },
    options: {
      typeAware: true,
      typeCheck: true,
      denyWarnings: true,
    },
  },
  pack: {
    entry: "src/cli.ts",
    format: "esm",
    platform: "node",
    deps: {
      neverBundle: ["typescript"],
    },
  },
});
