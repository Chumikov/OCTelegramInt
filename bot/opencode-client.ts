let serverUrl: string = "";

export function registerServer(url: string): void {
  serverUrl = url;
  console.log(`[opencode-client] Registered server: ${serverUrl}`);
}

export function getServerUrl(): string {
  return serverUrl;
}
