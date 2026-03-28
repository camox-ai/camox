import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/features/*.ts",
  out: "./migrations",
  dialect: "sqlite",
});
