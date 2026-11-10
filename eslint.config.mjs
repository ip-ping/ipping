import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // The interface is built from shadcn/ui components only (src/components/ui, added with the shadcn CLI and never edited
  // by hand). A raw HTML control or table anywhere else is a component that should come from there.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name=/^(button|input|select|textarea|label|table|thead|tbody|tfoot|tr|th|td|details|summary|dialog|progress|meter)$/]",
          message: "Use the shadcn component from @/components/ui instead of a raw HTML element.",
        },
      ],
    },
  },
]);

export default eslintConfig;
