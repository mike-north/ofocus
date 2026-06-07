import type { IdentityProvider } from "../../src/identity/types.js";

/** Deterministic IdentityProvider double. Maps a fixed code → email. */
export class FakeIdentityProvider implements IdentityProvider {
  constructor(private readonly codeToEmail: Record<string, string>) {}

  buildAuthorizationUrl(params: {
    state: string;
    redirectUri: string;
  }): string {
    const u = new URL("https://accounts.google.test/o/oauth2/v2/auth");
    u.searchParams.set("state", params.state);
    u.searchParams.set("redirect_uri", params.redirectUri);
    return u.toString();
  }

  exchangeCodeForEmail(params: {
    code: string;
    redirectUri: string;
  }): Promise<string> {
    const email = this.codeToEmail[params.code];
    if (!email) return Promise.reject(new Error("invalid google code"));
    return Promise.resolve(email.toLowerCase());
  }
}
