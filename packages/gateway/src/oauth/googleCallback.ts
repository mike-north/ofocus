import type { RequestHandler } from "express";
import type { OfocusOAuthProvider } from "./provider.js";

/** GET /auth/google/callback?code=&state= — completes upstream login. */
export function googleCallbackHandler(
  provider: OfocusOAuthProvider
): RequestHandler {
  return (req, res) => {
    const code =
      typeof req.query["code"] === "string" ? req.query["code"] : undefined;
    const state =
      typeof req.query["state"] === "string" ? req.query["state"] : undefined;
    if (!code || !state) {
      res.status(400).send("missing code or state");
      return;
    }
    provider
      .completeLogin({ googleCode: code, state })
      .then((redirectUrl) => {
        res.redirect(redirectUrl);
      })
      .catch((err: unknown) => {
        if (err instanceof Error) {
          console.error(
            "[googleCallback] login failed:",
            err.message,
            err.stack ?? ""
          );
        } else {
          console.error("[googleCallback] login failed:", String(err));
        }
        res.status(403).send("Authorization denied");
      });
  };
}
