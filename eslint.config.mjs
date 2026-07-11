import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["drizzle/**", ".next/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
);
