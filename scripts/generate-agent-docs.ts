/**
 * Agent-docs auto-generator.
 *
 * Reads descriptor exports from the built `@ofocus/sdk` dist and writes three
 * markdown documents:
 *   - AGENT_INSTRUCTIONS.md  — MCP-facing reference
 *   - AGENT_CLI_INSTRUCTIONS.md — CLI-facing reference
 *   - skills/ofocus/SKILL.md — Claude skill metadata + content
 *
 * This generator is the source of truth for those three files. Wiring it into
 * `pnpm build` is intentionally deferred to the W3-batch-7 PR that finalizes
 * the descriptor surface and removes the legacy CommandInfo[] surface.
 *
 * Usage:
 *   pnpm generate:agent-docs
 *   pnpm generate:agent-docs --out-instructions /tmp/AGENT_INSTRUCTIONS.md \
 *                             --out-cli /tmp/AGENT_CLI_INSTRUCTIONS.md \
 *                             --out-skill /tmp/SKILL.md
 *
 * All three default to stdout if the corresponding --out-* flag is omitted.
 */

import { writeFileSync } from "fs";
import { dirname } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";

// ─── descriptor type ─────────────────────────────────────────────────────────
// We use a minimal structural type here so the generator does not need to
// import from zod at runtime. The Zod schema node is accessed only via its
// duck-typed interface (checking `_def.typeName`, `shape`, etc.) so the
// generator can run after `pnpm build` without needing zod in root devDeps.

/** Minimal view of a Zod schema node sufficient for documentation generation. */
interface ZodNode {
  _def: {
    typeName: string;
    description?: string | undefined;
    innerType?: ZodNode | undefined;
    type?: ZodNode | undefined; // ZodArray element type
    values?: string[] | undefined; // ZodEnum values
    options?: ZodNode[] | undefined; // ZodUnion options
    shape?: () => Record<string, ZodNode>;
  };
}

/** Minimal resolved descriptor shape used by the generator. */
export interface DescriptorView {
  name: string;
  cliName: string;
  mcpName: string;
  description: string;
  cliPositional: readonly string[];
  inputSchema: {
    shape: Record<string, ZodNode>;
  };
}

// ─── descriptor loading ──────────────────────────────────────────────────────

/**
 * Type guard: check whether an exported value looks like a ResolvedCommandDescriptor.
 * We check the minimal shape that every resolved descriptor carries.
 * We intentionally do NOT check `handler` here so the generator never
 * accidentally invokes it.
 */
function isDescriptor(value: unknown): value is DescriptorView {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["name"] === "string" &&
    typeof v["cliName"] === "string" &&
    typeof v["mcpName"] === "string" &&
    typeof v["description"] === "string" &&
    typeof v["inputSchema"] === "object" &&
    v["inputSchema"] !== null &&
    "shape" in (v["inputSchema"] as object)
  );
}

async function loadDescriptors(): Promise<DescriptorView[]> {
  let sdk: Record<string, unknown>;
  try {
    sdk = (await import("../packages/sdk/dist/index.js")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new Error(
      "Could not import @ofocus/sdk dist. Run `pnpm build` first."
    );
  }

  const descriptors: DescriptorView[] = [];
  for (const [key, value] of Object.entries(sdk)) {
    if (isDescriptor(value) && key.endsWith("Descriptor")) {
      descriptors.push(value);
    }
  }
  return descriptors;
}

// ─── domain mapping ──────────────────────────────────────────────────────────

/**
 * Domain grouping for descriptors.
 *
 * The mapping is checked first — if a descriptor's `name` matches a key, it
 * goes into that group. If no match is found, the prefix rule applies:
 * `listProjects` → Projects, etc.
 *
 * Explicit mapping covers commands whose canonical name doesn't carry a
 * useful prefix (or whose prefix would map to the wrong domain).
 */
const EXPLICIT_DOMAIN_MAP: Record<string, string> = {
  // Task-adjacent
  addToInbox: "Tasks",
  searchTasks: "Tasks",
  queryForecast: "Forecast",
  queryDeferred: "Tasks",
  quickCapture: "Tasks",
  // Batch
  completeTasks: "Batch",
  updateTasks: "Batch",
  deleteTasks: "Batch",
  deferTasks: "Batch",
  // Focus
  focusOn: "Focus",
  unfocus: "Focus",
  getFocused: "Focus",
};

/**
 * Prefix → domain label table. Checked in order after the explicit map misses.
 *
 * IMPORTANT: More specific prefixes MUST appear before shorter overlapping
 * ones (e.g., "listProjects" before "list"). The first match wins.
 */
const PREFIX_DOMAIN_MAP: [prefix: string, domain: string][] = [
  // Projects — specific prefixes before "project"
  ["listProjects", "Projects"],
  ["createProject", "Projects"],
  ["updateProject", "Projects"],
  ["deleteProject", "Projects"],
  ["dropProject", "Projects"],
  ["project", "Projects"],
  // Folders — specific prefixes before "folder"
  ["listFolders", "Folders"],
  ["createFolder", "Folders"],
  ["updateFolder", "Folders"],
  ["deleteFolder", "Folders"],
  ["folder", "Folders"],
  // Tags — specific prefixes before "tag"
  ["listTags", "Tags"],
  ["createTag", "Tags"],
  ["updateTag", "Tags"],
  ["deleteTag", "Tags"],
  ["tag", "Tags"],
  // Tasks — subtask- and batch-specific names before generic task verbs
  ["createSubtask", "Tasks"],
  ["querySubtasks", "Tasks"],
  ["moveTask", "Tasks"],
  ["searchTask", "Tasks"],
  ["addToInbox", "Tasks"],
  ["completeTask", "Tasks"],
  ["updateTask", "Tasks"],
  ["dropTask", "Tasks"],
  ["deleteTask", "Tasks"],
  ["duplicateTask", "Tasks"],
  ["deferTask", "Tasks"],
  ["complete", "Tasks"],
  ["update", "Tasks"],
  ["drop", "Tasks"],
  ["delete", "Tasks"],
  ["duplicate", "Tasks"],
  ["defer", "Tasks"],
  ["query", "Tasks"],
  ["list", "Tasks"],
  // Review
  ["review", "Review"],
  // Forecast
  ["forecast", "Forecast"],
  // Focus
  ["focusOn", "Focus"],
  ["unfocus", "Focus"],
  ["getFocused", "Focus"],
  ["focus", "Focus"],
  // Perspectives
  ["perspective", "Perspectives"],
  // Templates
  ["template", "Templates"],
  ["saveTemplate", "Templates"],
  ["listTemplates", "Templates"],
  ["getTemplate", "Templates"],
  ["createFromTemplate", "Templates"],
  ["deleteTemplate", "Templates"],
  // Attachments
  ["addAttachment", "Attachments"],
  ["listAttachments", "Attachments"],
  ["removeAttachment", "Attachments"],
  ["attach", "Attachments"],
  ["detach", "Attachments"],
  // Sync
  ["getSyncStatus", "Sync"],
  ["triggerSync", "Sync"],
  ["sync", "Sync"],
  // TaskPaper
  ["exportTaskPaper", "TaskPaper"],
  ["importTaskPaper", "TaskPaper"],
  ["taskPaper", "TaskPaper"],
  // Utilities
  ["getStats", "Utilities"],
  ["generateUrl", "Utilities"],
  ["openItem", "Utilities"],
  ["archiveTasks", "Utilities"],
  ["compactDatabase", "Utilities"],
  ["stats", "Utilities"],
  ["url", "Utilities"],
  ["open", "Utilities"],
  ["archive", "Utilities"],
  ["compact", "Utilities"],
];

/** Preferred display order for domain sections. */
const DOMAIN_ORDER = [
  "Tasks",
  "Batch",
  "Projects",
  "Folders",
  "Tags",
  "Perspectives",
  "Forecast",
  "Focus",
  "Review",
  "Templates",
  "Attachments",
  "Sync",
  "TaskPaper",
  "Utilities",
  "Other",
];

export function getDomain(name: string): string {
  // Explicit map wins
  if (name in EXPLICIT_DOMAIN_MAP) {
    return EXPLICIT_DOMAIN_MAP[name]!;
  }

  // Prefix match
  for (const [prefix, domain] of PREFIX_DOMAIN_MAP) {
    if (name.startsWith(prefix)) {
      return domain;
    }
  }

  return "Other";
}

// ─── Zod schema introspection (duck-typed, no zod import) ───────────────────

export interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  isArray: boolean;
  isBoolean: boolean;
}

/**
 * Convert a camelCase schema field name to a kebab-case CLI flag name.
 *
 * @example
 * ```
 * kebabFromSchemaField("repeatFrequency") // "--repeat-frequency"
 * kebabFromSchemaField("taskId")           // "--task-id"
 * kebabFromSchemaField("due")              // "--due"
 * ```
 */
export function kebabFromSchemaField(name: string): string {
  const kebab = name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
  return `--${kebab}`;
}

/**
 * Unwrap Zod optional/nullable/default wrappers.
 *
 * Uses duck typing on `_def.typeName` so this works without importing zod.
 */
function unwrapZodNode(node: ZodNode): ZodNode {
  const tn = node._def.typeName;
  if (tn === "ZodOptional" || tn === "ZodNullable" || tn === "ZodDefault") {
    const inner = node._def.innerType;
    if (inner) return unwrapZodNode(inner);
  }
  return node;
}

/**
 * Derive a human-readable type label from a Zod schema node (duck-typed).
 */
export function zodTypeLabel(node: ZodNode): string {
  const unwrapped = unwrapZodNode(node);
  const tn = unwrapped._def.typeName;

  switch (tn) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray": {
      const element = unwrapped._def.type;
      return element ? `${zodTypeLabel(element)}[]` : "unknown[]";
    }
    case "ZodEnum": {
      const values = unwrapped._def.values;
      return values ? values.join(" | ") : "string";
    }
    case "ZodUnion": {
      const options = unwrapped._def.options;
      return options ? options.map(zodTypeLabel).join(" | ") : "unknown";
    }
    case "ZodObject":
      return "object";
    default:
      return "unknown";
  }
}

function isNodeRequired(node: ZodNode): boolean {
  const tn = node._def.typeName;
  return tn !== "ZodOptional" && tn !== "ZodNullable";
}

function isNodeBoolean(node: ZodNode): boolean {
  return unwrapZodNode(node)._def.typeName === "ZodBoolean";
}

function isNodeArray(node: ZodNode): boolean {
  return unwrapZodNode(node)._def.typeName === "ZodArray";
}

function getNodeDescription(node: ZodNode): string {
  return node._def.description ?? "";
}

/**
 * Extract field info from a descriptor's input schema.
 */
export function extractFields(descriptor: DescriptorView): FieldInfo[] {
  const shape = descriptor.inputSchema.shape;
  return Object.entries(shape).map(([name, fieldNode]) => ({
    name,
    type: zodTypeLabel(fieldNode),
    required: isNodeRequired(fieldNode),
    description: getNodeDescription(fieldNode),
    isArray: isNodeArray(fieldNode),
    isBoolean: isNodeBoolean(fieldNode),
  }));
}

// ─── CLI usage line builder ──────────────────────────────────────────────────

/**
 * Build the CLI usage line for a descriptor.
 *
 * Positional args are listed first in `<angle>` brackets (required) or
 * `[angle]` (optional, though positionals are almost always required).
 * Remaining fields become `--flag` options.
 *
 * @example
 * ```
 * usageLineForDescriptor(addToInboxDescriptor)
 * // "ofocus inbox <title> [--note <text>] [--due <date>] ..."
 * ```
 */
export function usageLineForDescriptor(descriptor: DescriptorView): string {
  const shape = descriptor.inputSchema.shape;
  const positionals = new Set(descriptor.cliPositional);
  const parts: string[] = [`ofocus ${descriptor.cliName}`];

  // Positional args first (in order)
  for (const pos of descriptor.cliPositional) {
    const fieldNode = shape[pos];
    const req = fieldNode ? isNodeRequired(fieldNode) : true;
    const arr = fieldNode ? isNodeArray(fieldNode) : false;
    if (req) {
      parts.push(arr ? `<${pos}...>` : `<${pos}>`);
    } else {
      parts.push(arr ? `[${pos}...]` : `[${pos}]`);
    }
  }

  // Remaining flags
  for (const [fieldName, fieldNode] of Object.entries(shape)) {
    if (positionals.has(fieldName)) continue;

    const req = isNodeRequired(fieldNode);
    const bool = isNodeBoolean(fieldNode);
    const arr = isNodeArray(fieldNode);
    const flag = kebabFromSchemaField(fieldName);

    let snippet: string;
    if (bool) {
      snippet = `${flag}`;
    } else if (arr) {
      snippet = `${flag} <val...>`;
    } else {
      snippet = `${flag} <${fieldName}>`;
    }

    parts.push(req ? snippet : `[${snippet}]`);
  }

  return parts.join(" ");
}

// ─── Markdown table helpers ──────────────────────────────────────────────────

/**
 * Escape a string for safe inclusion in a markdown table cell.
 *
 * A raw `|` in a cell value splits the row into extra columns, corrupting the
 * table. Enum type strings like `"active | on-hold"` trigger this. A literal
 * newline also breaks a table row, so newlines are replaced with a space.
 */
export function escapeTableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function mdTableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function mdTableHeader(headers: string[]): string {
  const sep = headers.map(() => "---");
  return [mdTableRow(headers), mdTableRow(sep)].join("\n");
}

/**
 * Build the markdown parameter table for the MCP tool view.
 */
export function mcpToolParamTable(descriptor: DescriptorView): string {
  const fields = extractFields(descriptor);
  if (fields.length === 0) return "_No parameters._";

  const rows = fields.map((f) =>
    mdTableRow([
      escapeTableCell(f.name),
      `\`${escapeTableCell(f.type)}\``,
      f.required ? "yes" : "no",
      escapeTableCell(f.description || "—"),
    ])
  );

  return [
    mdTableHeader(["Parameter", "Type", "Required", "Description"]),
    ...rows,
  ].join("\n");
}

/**
 * Build the CLI flag table (flag → type → required → description).
 *
 * For boolean fields, Commander registers BOTH `--foo` and `--no-foo` (see
 * `registry-adapter.ts` `addOptionForField`). Both forms are documented here
 * so the reference matches real CLI behaviour.
 */
export function cliFlagTable(descriptor: DescriptorView): string {
  const shape = descriptor.inputSchema.shape;
  const positionals = new Set(descriptor.cliPositional);
  const flagFields = Object.entries(shape).filter(([n]) => !positionals.has(n));

  if (flagFields.length === 0) return "_No flags._";

  const rows: string[] = [];
  for (const [fieldName, fieldNode] of flagFields) {
    const flag = kebabFromSchemaField(fieldName);
    const type = zodTypeLabel(fieldNode);
    const req = isNodeRequired(fieldNode) ? "yes" : "no";
    const desc = escapeTableCell(getNodeDescription(fieldNode) || "—");

    if (isNodeBoolean(fieldNode)) {
      // Emit both affirmative and negated forms on a single row, mirroring
      // how Commander's registry-adapter registers them.
      const flagCell = `\`${flag}\` / \`--no-${flag.slice(2)}\``;
      rows.push(
        mdTableRow([flagCell, `\`${escapeTableCell(type)}\``, req, desc])
      );
    } else {
      rows.push(
        mdTableRow([`\`${flag}\``, `\`${escapeTableCell(type)}\``, req, desc])
      );
    }
  }

  return [
    mdTableHeader(["Flag", "Type", "Required", "Description"]),
    ...rows,
  ].join("\n");
}

// ─── Document renderers ──────────────────────────────────────────────────────

function groupDescriptors(
  descriptors: DescriptorView[]
): Map<string, DescriptorView[]> {
  const map = new Map<string, DescriptorView[]>();
  for (const d of descriptors) {
    const domain = getDomain(d.name);
    const group = map.get(domain) ?? [];
    group.push(d);
    map.set(domain, group);
  }

  // Sort by preferred domain order, with "Other" last
  const ordered = new Map<string, DescriptorView[]>();
  for (const domain of DOMAIN_ORDER) {
    const group = map.get(domain);
    if (group && group.length > 0) {
      ordered.set(domain, group);
    }
  }
  // Append any domains not in the order list
  for (const [domain, group] of map) {
    if (!ordered.has(domain)) {
      ordered.set(domain, group);
    }
  }

  return ordered;
}

/**
 * Build one MCP tool section for AGENT_INSTRUCTIONS.md.
 */
function renderMcpTool(d: DescriptorView): string {
  const lines: string[] = [];
  lines.push(`#### \`${d.mcpName}\``);
  lines.push("");
  lines.push(d.description);
  lines.push("");
  lines.push(mcpToolParamTable(d));
  lines.push("");

  // Example: compose a one-liner with the first required param
  const fields = extractFields(d);
  const requiredFields = fields.filter((f) => f.required);
  if (requiredFields.length > 0) {
    const exampleArgs = requiredFields.map((f) => {
      if (f.isBoolean) return `"${f.name}": true`;
      if (f.isArray) return `"${f.name}": ["<value>"]`;
      return `"${f.name}": "<${f.name}>"`;
    });
    lines.push(`**Example:** \`{ ${exampleArgs.join(", ")} }\``);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Render AGENT_INSTRUCTIONS.md (MCP-facing reference).
 *
 * <!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->
 */
export function renderAgentInstructions(descriptors: DescriptorView[]): string {
  const groups = groupDescriptors(descriptors);
  const lines: string[] = [];

  lines.push(`# OmniFocus MCP Tools — Agent Reference`);
  lines.push("");
  lines.push(
    `<!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->`
  );
  lines.push("");
  lines.push(
    `This document is the authoritative reference for all OmniFocus MCP tools available to agents.`
  );
  lines.push(
    `All tool names use \`snake_case\`. Parameters are passed as JSON objects.`
  );
  lines.push("");
  lines.push(`## Output Envelope`);
  lines.push("");
  lines.push(
    `Every tool returns an MCP \`CallToolResult\`. The payload is JSON-encoded in \`content[0].text\`.`
  );
  lines.push(`On success, \`content[0].text\` contains the result JSON:`);
  lines.push("");
  lines.push("```json");
  lines.push(`{ "content": [{ "type": "text", "text": "<result-json>" }] }`);
  lines.push("```");
  lines.push("");
  lines.push(
    `On failure, \`isError\` is \`true\` and \`content[0].text\` contains the error details:`
  );
  lines.push("");
  lines.push("```json");
  lines.push(
    `{ "content": [{ "type": "text", "text": "<error-json>" }], "isError": true }`
  );
  lines.push("```");
  lines.push("");
  lines.push(
    `The result JSON uses TOON format (token-efficient) by default for descriptor-backed tools. ` +
      `Pass \`--format json\` on the CLI (or set \`format: "json"\` as a parameter) to get standard JSON.`
  );
  lines.push("");

  for (const [domain, group] of groups) {
    lines.push(`## ${domain}`);
    lines.push("");
    for (const d of group) {
      lines.push(renderMcpTool(d));
    }
  }

  return lines.join("\n");
}

/**
 * Build one CLI command section for AGENT_CLI_INSTRUCTIONS.md.
 */
function renderCliCommand(d: DescriptorView): string {
  const lines: string[] = [];
  lines.push(`#### \`ofocus ${d.cliName}\``);
  lines.push("");
  lines.push(d.description);
  lines.push("");
  lines.push("**Usage:**");
  lines.push("");
  lines.push("```bash");
  lines.push(usageLineForDescriptor(d));
  lines.push("```");
  lines.push("");

  const flagTable = cliFlagTable(d);
  if (flagTable !== "_No flags._") {
    lines.push("**Flags:**");
    lines.push("");
    lines.push(flagTable);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Render AGENT_CLI_INSTRUCTIONS.md (CLI-facing reference).
 *
 * <!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->
 */
export function renderCliInstructions(descriptors: DescriptorView[]): string {
  const groups = groupDescriptors(descriptors);
  const lines: string[] = [];

  lines.push(`# OmniFocus CLI — Agent Reference`);
  lines.push("");
  lines.push(
    `<!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->`
  );
  lines.push("");
  lines.push(
    `This document is the authoritative reference for the \`ofocus\` CLI.`
  );
  lines.push(
    `All commands output JSON by default. Use \`--human\` for human-readable output.`
  );
  lines.push("");
  lines.push(`## Output Format`);
  lines.push("");
  lines.push("```json");
  lines.push(`{ "success": true, "data": { ... } }`);
  lines.push(
    `{ "success": false, "error": { "code": "...", "message": "..." } }`
  );
  lines.push("```");
  lines.push("");

  for (const [domain, group] of groups) {
    lines.push(`## ${domain}`);
    lines.push("");
    for (const d of group) {
      lines.push(renderCliCommand(d));
    }
  }

  return lines.join("\n");
}

/**
 * Render skills/ofocus/SKILL.md.
 *
 * Preserves the YAML frontmatter (static). The Commands section is
 * auto-generated from descriptors.
 *
 * <!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->
 */
export function renderSkillMd(descriptors: DescriptorView[]): string {
  const groups = groupDescriptors(descriptors);
  const lines: string[] = [];

  // YAML frontmatter is preserved as-is (static)
  lines.push(`---`);
  lines.push(`name: ofocus`);
  lines.push(
    `description: Interact with OmniFocus on macOS via CLI. Manage tasks, projects, folders, tags, and perspectives using the ofocus command-line tool.`
  );
  lines.push(`---`);
  lines.push("");
  lines.push(`# OmniFocus CLI Skill`);
  lines.push("");
  lines.push(
    `<!-- generated: DO NOT EDIT BY HAND — see scripts/generate-agent-docs.ts -->`
  );
  lines.push("");
  lines.push(
    `Use the \`ofocus\` CLI to interact with OmniFocus on macOS. All commands return JSON by default.`
  );
  lines.push("");
  lines.push(`## Prerequisites`);
  lines.push("");
  lines.push(`- macOS with OmniFocus installed`);
  lines.push(`- Install: \`npm install -g ofocus\``);
  lines.push("");
  lines.push(`## Output Format`);
  lines.push("");
  lines.push(
    `- Default: JSON with \`success\` and \`data\` or \`error\` fields`
  );
  lines.push(`- Use \`--human\` flag for human-readable output`);
  lines.push("");
  lines.push(`## Command Quick Reference`);
  lines.push("");

  for (const [domain, group] of groups) {
    lines.push(`### ${domain}`);
    lines.push("");
    lines.push("```bash");
    for (const d of group) {
      lines.push(`${usageLineForDescriptor(d)}  # ${d.description}`);
    }
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── CLI parsing ─────────────────────────────────────────────────────────────

interface CliArgs {
  outInstructions: string | null;
  outCli: string | null;
  outSkill: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    outInstructions: null,
    outCli: null,
    outSkill: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out-instructions" && argv[i + 1]) {
      args.outInstructions = argv[i + 1]!;
      i++;
    } else if (arg === "--out-cli" && argv[i + 1]) {
      args.outCli = argv[i + 1]!;
      i++;
    } else if (arg === "--out-skill" && argv[i + 1]) {
      args.outSkill = argv[i + 1]!;
      i++;
    }
  }

  return args;
}

function writeOutput(content: string, path: string | null): void {
  if (path === null) {
    process.stdout.write(content + "\n");
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content + "\n", "utf-8");
    process.stderr.write(`Wrote ${path}\n`);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

// Detect if this file is being executed directly (not imported as a module).
const currentFile = fileURLToPath(import.meta.url);
const calledFile = process.argv[1]
  ? new URL(`file://${process.argv[1]}`).pathname
  : "";
if (
  currentFile === calledFile ||
  process.argv[1]?.endsWith("generate-agent-docs.ts")
) {
  const args = parseArgs(process.argv.slice(2));

  try {
    const descriptors = await loadDescriptors();

    if (descriptors.length === 0) {
      throw new Error(
        "No descriptors found in @ofocus/sdk. Did the build complete?"
      );
    }

    const instructions = renderAgentInstructions(descriptors);
    const cliInstructions = renderCliInstructions(descriptors);
    const skill = renderSkillMd(descriptors);

    // If all three output paths are null, write all three to stdout with
    // section headers. If any are set, write each document to its target.
    const anyOut =
      args.outInstructions !== null ||
      args.outCli !== null ||
      args.outSkill !== null;

    if (!anyOut) {
      writeOutput("=== AGENT_INSTRUCTIONS.md ===\n" + instructions, null);
      writeOutput(
        "\n=== AGENT_CLI_INSTRUCTIONS.md ===\n" + cliInstructions,
        null
      );
      writeOutput("\n=== skills/ofocus/SKILL.md ===\n" + skill, null);
    } else {
      writeOutput(instructions, args.outInstructions);
      writeOutput(cliInstructions, args.outCli);
      writeOutput(skill, args.outSkill);
    }
  } catch (err) {
    process.stderr.write(`Error: ${String(err)}\n`);
    process.exit(1);
  }
}
