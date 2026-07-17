/**
 * Reads an environment variable, failing loudly instead of letting `undefined`
 * flow into a client constructor and surface later as an opaque 401.
 *
 * Only safe for server-side vars and NEXT_PUBLIC_* vars referenced as literal
 * `process.env.FOO` at the call site — Next.js inlines public vars at build
 * time, so a dynamic lookup would be undefined in the browser.
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}
