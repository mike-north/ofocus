#!/usr/bin/env node

// Re-export everything from SDK
export * from "@ofocus/sdk";

// Re-export CLI utilities
export { createCli, outputJson, outputHuman } from "@ofocus/cli";

// Run CLI when executed directly
import { createCli } from "@ofocus/cli";
createCli().parse();
