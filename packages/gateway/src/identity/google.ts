import { OAuth2Client } from "google-auth-library";
import type { IdentityProvider } from "./types.js";

export class GoogleIdentityProvider implements IdentityProvider {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  buildAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
  }): string {
    const client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      params.redirectUri
    );
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["openid", "email"],
      state: params.state,
    });
  }

  async exchangeCodeForEmail(params: {
    code: string;
    redirectUri: string;
  }): Promise<string> {
    const client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      params.redirectUri
    );
    const { tokens } = await client.getToken(params.code);
    if (!tokens.id_token) throw new Error("Google did not return an id_token");
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || payload.email_verified !== true) {
      throw new Error("Google profile has no verified email");
    }
    return payload.email.toLowerCase();
  }
}
