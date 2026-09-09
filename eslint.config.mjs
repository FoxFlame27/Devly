import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", ".data/**", "node_modules/**", "next-env.d.ts", "src/generated/**"],
  },
];

export default config;
