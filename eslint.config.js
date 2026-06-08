import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import omniscriptClosure from "./tools/eslint-rules/no-omniscript-closure.mjs";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-plusplus": "off",
    },
  },
  {
    files: ["packages/**/*.ts"],
    plugins: {
      ofocus: { rules: { "no-omniscript-closure": omniscriptClosure } },
    },
    rules: { "ofocus/no-omniscript-closure": "error" },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.config.js",
      "*.config.cjs",
      "packages/*/dist/**",
      "packages/*/temp/**",
    ],
  }
);
