const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAllowedServerHttpUrl(value: string, nodeEnv: string | undefined): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return nodeEnv !== "production" && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
