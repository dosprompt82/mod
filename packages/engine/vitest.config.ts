import { defineConfig } from "vitest/config";
export default defineConfig({ test: { coverage: { include: ["src/**"], thresholds: { lines: 95, functions: 95, statements: 95, branches: 90 } } } });
