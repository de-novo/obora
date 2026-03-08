export const fetchUrlTool = {
  definition: {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch a URL and return its contents as text.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL to fetch" },
          maxChars: { type: "number", description: "Optional max characters to return" },
        },
        required: ["url"],
      },
    },
  },
  execute: async (args) => {
    const url = typeof args.url === "string" ? args.url : "";
    const maxChars = typeof args.maxChars === "number" && Number.isFinite(args.maxChars)
      ? Math.max(200, Math.floor(args.maxChars))
      : 15000;
    if (!/^https?:\/\//.test(url)) return "Error: url must start with http:// or https://";
    const response = await fetch(url, {
      headers: {
        "user-agent": "obora-sandbox-live-fetch/1.0",
        "accept": "text/plain, application/json, text/html;q=0.9, */*;q=0.8",
      },
    });
    const text = await response.text();
    return JSON.stringify({
      url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      body: text.length > maxChars ? `${text.slice(0, maxChars)}\n...[truncated]` : text,
    }, null, 2);
  },
};

export const npmPackageInfoTool = {
  definition: {
    type: "function",
    function: {
      name: "npm_package_info",
      description: "Fetch package metadata from the npm registry and return the latest version plus key metadata.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "npm package name" },
        },
        required: ["name"],
      },
    },
  },
  execute: async (args) => {
    const name = typeof args.name === "string" ? args.name : "";
    if (!name) return "Error: package name is required";
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: {
        "user-agent": "obora-sandbox-npm-info/1.0",
        "accept": "application/json",
      },
    });
    if (!response.ok) {
      return JSON.stringify({ name, status: response.status, ok: false }, null, 2);
    }
    const data = await response.json();
    const latest = data?.["dist-tags"]?.latest;
    const latestMeta = latest ? data?.versions?.[latest] : undefined;
    return JSON.stringify({
      name,
      latest,
      description: data?.description,
      dependencies: latestMeta?.dependencies,
      peerDependencies: latestMeta?.peerDependencies,
    }, null, 2);
  },
};

export const customTools = [fetchUrlTool, npmPackageInfoTool];
