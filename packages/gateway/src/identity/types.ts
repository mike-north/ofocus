export interface IdentityProvider {
  /**
   * Build the upstream authorization URL the user is redirected to in order to log in.
   * `state` is opaque round-trip data; `redirectUri` is this gateway's callback.
   */
  buildAuthorizationUrl(params: { state: string; redirectUri: string }): string;
  /**
   * Exchange the upstream authorization `code` for the authenticated user's email.
   * Throws if the code is invalid or no verified email is present.
   */
  exchangeCodeForEmail(params: {
    code: string;
    redirectUri: string;
  }): Promise<string>;
}
