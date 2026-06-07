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
      .catch((_err: unknown) => {
        console.error(
          "[googleCallback] login failed (allowlist rejection, expired session, or upstream error)"
        );
        res.status(403).send("Authorization denied");
      });
  };
}
