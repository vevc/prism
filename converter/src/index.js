import HTML from "./ui.html";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }));
    }

    if (request.method === "GET") {
      const workerUrl = new URL(request.url);
      workerUrl.pathname = "/";
      workerUrl.search = "";
      const html = HTML.replace("WORKER_URL_PLACEHOLDER", workerUrl.origin + "/");
      return new Response(html, {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    if (request.method !== "POST") {
      return corsResponse(new Response("Method Not Allowed", { status: 405 }));
    }

    const { SECRET_KEY, PROXY_DOMAIN } = env;
    if (!SECRET_KEY || !PROXY_DOMAIN) {
      return corsResponse(
        new Response("Server misconfigured", { status: 500 })
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(new Response("Invalid JSON", { status: 400 }));
    }

    const lines = body.links;
    if (!Array.isArray(lines) || lines.length === 0) {
      return corsResponse(
        new Response('Missing "links" array', { status: 400 })
      );
    }

    const results = await Promise.all(
      lines.map((line) => convertLine(line, SECRET_KEY, PROXY_DOMAIN))
    );

    return corsResponse(
      new Response(JSON.stringify({ results }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  },
};

async function convertLine(raw, secretKey, proxyDomain) {
  const line = raw.trim();
  if (!line) return { ok: false, error: "空行", original: "" };

  const match = line.match(/^vless:\/\/([^@]+)@([^:/?#]+):(\d+)(.*)/);
  if (!match) {
    return { ok: false, error: "格式无法解析", original: line };
  }

  const [, uuid, address, port, rest] = match;

  const paramSplit = rest.indexOf("?");
  let queryStr = "";
  let fragment = "";

  if (paramSplit !== -1) {
    const afterQ = rest.slice(paramSplit + 1);
    const hashIdx = afterQ.indexOf("#");
    if (hashIdx !== -1) {
      queryStr = afterQ.slice(0, hashIdx);
      fragment = afterQ.slice(hashIdx + 1);
    } else {
      queryStr = afterQ;
    }
  } else {
    const hashIdx = rest.indexOf("#");
    if (hashIdx !== -1) {
      fragment = rest.slice(hashIdx + 1);
    }
  }

  const params = new URLSearchParams(queryStr);

  const targetDomain = params.get("sni") || address;
  const token = await signHMAC(targetDomain, secretKey);

  params.set("sni", proxyDomain);
  if (params.has("host")) {
    params.set("host", proxyDomain);
  }

  const originalPath = params.get("path") || "/";
  const decodedPath = decodeURIComponent(originalPath);
  const sep = decodedPath.includes("?") ? "&" : "?";
  const newPath =
    decodedPath +
    sep +
    "d=" +
    encodeURIComponent(targetDomain) +
    "&t=" +
    encodeURIComponent(token);
  params.set("path", newPath);

  const converted =
    "vless://" +
    uuid +
    "@" +
    proxyDomain +
    ":" +
    port +
    "?" +
    params.toString() +
    (fragment ? "#" + fragment : "");

  return { ok: true, converted };
}

async function signHMAC(message, secretStr) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretStr),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message)
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function corsResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
