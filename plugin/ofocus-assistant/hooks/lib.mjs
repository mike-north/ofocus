// Pure, dependency-free helpers for the ofocus-assistant hook.
export const PLUGIN_NAME = "ofocus-assistant";

/**
 * Derive a stable per-session key from a hook stdin payload, via a fallback
 * chain so it never depends on one field. Never agent-generated.
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function sessionKey(payload) {
  const sid = typeof payload.session_id === "string" ? payload.session_id.trim() : "";
  if (sid.length > 0) return sid;
  const tp = typeof payload.transcript_path === "string" ? payload.transcript_path.trim() : "";
  if (tp.length > 0) return tp;
  return "_shared";
}
