import { z } from "zod";

export interface GatewayConfig {
  issuerUrl: URL;
  port: number;
  googleClientId: string;
  googleClientSecret: string;
  allowedEmails: string[];
  stateDir: string;
  exposedTools: "all" | Set<string>;
  accessTokenTtlSeconds: number;
}

const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith("https://"), {
    message: "OFOCUS_GATEWAY_ISSUER_URL must be an https:// URL",
  });

const csv = (s: string): string[] =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

const envSchema = z.object({
  OFOCUS_GATEWAY_ISSUER_URL: httpsUrl,
  OFOCUS_GATEWAY_PORT: z.coerce.number().int().positive().default(8722),
  OFOCUS_GATEWAY_GOOGLE_CLIENT_ID: z.string().min(1),
  OFOCUS_GATEWAY_GOOGLE_CLIENT_SECRET: z.string().min(1),
  OFOCUS_GATEWAY_ALLOWED_EMAILS: z
    .string()
    .min(1, "must list at least one allowed email"),
  OFOCUS_GATEWAY_STATE_DIR: z.string().min(1),
  OFOCUS_GATEWAY_EXPOSED_TOOLS: z.string().optional(),
  OFOCUS_GATEWAY_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
});

/** Validate and normalize the process environment into a GatewayConfig. */
export function loadConfig(
  env: Record<string, string | undefined>
): GatewayConfig {
  const parsed = envSchema.parse(env);

  const allowedEmails = csv(parsed.OFOCUS_GATEWAY_ALLOWED_EMAILS).map((e) =>
    e.toLowerCase()
  );
  if (allowedEmails.length === 0) {
    throw new Error(
      "OFOCUS_GATEWAY_ALLOWED_EMAILS must list at least one allowed email"
    );
  }

  const toolsRaw = parsed.OFOCUS_GATEWAY_EXPOSED_TOOLS?.trim();
  const exposedTools: "all" | Set<string> =
    !toolsRaw || toolsRaw === "all" ? "all" : new Set(csv(toolsRaw));

  return {
    issuerUrl: new URL(parsed.OFOCUS_GATEWAY_ISSUER_URL),
    port: parsed.OFOCUS_GATEWAY_PORT,
    googleClientId: parsed.OFOCUS_GATEWAY_GOOGLE_CLIENT_ID,
    googleClientSecret: parsed.OFOCUS_GATEWAY_GOOGLE_CLIENT_SECRET,
    allowedEmails,
    stateDir: parsed.OFOCUS_GATEWAY_STATE_DIR,
    exposedTools,
    accessTokenTtlSeconds: parsed.OFOCUS_GATEWAY_ACCESS_TOKEN_TTL_SECONDS,
  };
}
