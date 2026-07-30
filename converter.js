const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Prism · VLESS 订阅转换</title>
  <style>
    :root{color-scheme:dark;--bg:#0c1210;--card:#141e19;--line:#2a3b32;--text:#e7f1eb;--muted:#91a399;--accent:#45dd92;--bad:#ef8585;--warn:#eab96c}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(800px 500px at 0 0,#173b2b,var(--bg) 60%);color:var(--text);font:15px system-ui,sans-serif}
    main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:52px 0}.brand{margin:0;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.16em}h1{margin:10px 0;font-size:30px}.lead{color:var(--muted);line-height:1.6}
    label{display:block;margin-top:28px;color:var(--muted);font-size:13px;font-weight:600}textarea{display:block;width:100%;min-height:190px;margin-top:8px;padding:14px;border:1px solid var(--line);border-radius:10px;background:#09100d;color:var(--text);font:13px ui-monospace,monospace;line-height:1.5;resize:vertical}textarea:focus{outline:2px solid #45dd9255;border-color:var(--accent)}
    .actions{display:flex;gap:10px;margin-top:14px}button{border:1px solid var(--line);border-radius:8px;padding:9px 15px;background:transparent;color:var(--text);font-weight:650;cursor:pointer}button:hover{border-color:var(--accent);color:var(--accent)}button.primary{background:var(--accent);border-color:var(--accent);color:#062012}button:disabled{opacity:.5;cursor:wait}
    #status{min-height:22px;margin:16px 0;color:var(--muted)}#status.error{color:var(--bad)}#status.ok{color:var(--accent)}
    #warnings{margin-top:12px}.warning{margin:6px 0;padding:9px 12px;border-left:3px solid var(--warn);border-radius:5px;background:#eab96c12;color:var(--warn);font-size:13px}
    #result{display:none;margin-top:24px;padding-top:22px;border-top:1px solid var(--line)}#result.visible{display:block}.title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.title-row h2{margin:0;font-size:14px}.output{padding:14px;border:1px solid #45dd9244;border-radius:10px;background:#09100d;color:var(--accent);font:13px ui-monospace,monospace;line-height:1.55;white-space:pre-wrap;word-break:break-all}
    footer{margin-top:36px;color:var(--muted);font-size:12px;line-height:1.6}code{font-family:ui-monospace,monospace}
  </style>
</head>
<body>
<main>
  <p class="brand">PRISM</p>
  <h1>VLESS 订阅转换</h1>
  <p class="lead">粘贴 <code>vless://</code> 链接（每行一条），或 base64 编码的订阅内容。仅支持 VLESS；UUID 会在提交前脱敏，并在转换完成后自动还原。</p>
  <label for="input">订阅链接</label>
  <textarea id="input" spellcheck="false" placeholder="vless://uuid@example.com:443?encryption=none&security=tls&type=ws&path=%2F#example"></textarea>
  <div class="actions">
    <button class="primary" id="convert">转换</button>
    <button id="clear">清空</button>
  </div>
  <div id="warnings"></div>
  <p id="status" role="status"></p>
  <section id="result">
    <div class="title-row"><h2>转换结果</h2><button id="copy">复制</button></div>
    <div class="output" id="output"></div>
  </section>
  <footer>目标域名和签名由 Worker 在服务端生成；真实 UUID 仅在你的本地浏览器中处理，请放心使用。</footer>
</main>
<script>
const UUID_RE=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const input=document.querySelector("#input"),convert=document.querySelector("#convert"),clear=document.querySelector("#clear"),warnings=document.querySelector("#warnings"),status=document.querySelector("#status"),result=document.querySelector("#result"),output=document.querySelector("#output"),copy=document.querySelector("#copy");

function setStatus(message,type=""){status.textContent=message;status.className=type}
function decodeSubscription(value){
  const compact=value.trim().replace(/\\s/g,"");
  if(value.includes("://")||!/^[A-Za-z0-9+/]*={0,2}$/.test(compact))return value;
  try{return new TextDecoder().decode(Uint8Array.from(atob(compact),c=>c.charCodeAt(0)))}catch{return value}
}
function splitLinks(value){
  const vless=[],skipped=[];
  for(const line of decodeSubscription(value).split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean)){
    if(/^vless:\\/\\//i.test(line))vless.push(line);
    else skipped.push((line.match(/^([a-z][a-z0-9+.-]*):\\/\\//i)||["","未知协议"])[1]);
  }
  return {vless,skipped};
}
function maskUUIDs(links){
  const originals=new Map(),fakeToOriginal=new Map();let counter=1;
  const masked=links.map(link=>link.replace(UUID_RE,uuid=>{
    const key=uuid.toLowerCase();
    if(!originals.has(key)){
      const fake="00000000-1111-2222-3333-"+counter.toString(16).padStart(12,"0");
      originals.set(key,fake);fakeToOriginal.set(fake,uuid);counter++;
    }
    return originals.get(key);
  }));
  return {masked,fakeToOriginal};
}
function restoreUUIDs(value,fakeToOriginal){
  return value.replace(UUID_RE,uuid=>fakeToOriginal.get(uuid.toLowerCase())||uuid);
}
function showWarnings(skipped){
  if(!skipped.length){warnings.innerHTML="";return}
  const counts=new Map();for(const protocol of skipped)counts.set(protocol,(counts.get(protocol)||0)+1);
  warnings.innerHTML=[...counts].map(([p,n])=>'<div class="warning">已忽略 '+n+' 条 '+escapeHtml(p)+' 链接；本工具当前仅支持转换 VLESS 链接。</div>').join("");
}
function escapeHtml(value){const el=document.createElement("span");el.textContent=value;return el.innerHTML}

convert.addEventListener("click",async()=>{
  if(!input.value.trim()){setStatus("请输入订阅链接。","error");return}
  const {vless,skipped}=splitLinks(input.value);showWarnings(skipped);
  if(!vless.length){setStatus("没有可处理的 vless:// 链接。","error");result.classList.remove("visible");return}
  const {masked,fakeToOriginal}=maskUUIDs(vless);
  convert.disabled=true;result.classList.remove("visible");setStatus("转换中…");
  try{
    const response=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({links:masked})});
    const payload=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(payload?.error||"服务端错误（"+response.status+"）");
    const converted=[],errors=[];
    for(const [index,item] of payload.results.entries()){
      if(item.ok)converted.push(restoreUUIDs(item.converted,fakeToOriginal));
      else errors.push("第 "+(index+1)+" 条："+item.error);
    }
    if(converted.length){output.textContent=converted.join("\\n");result.classList.add("visible")}
    setStatus(errors.length?"已转换 "+converted.length+" 条；"+errors.join("；"):"已成功转换 "+converted.length+" 条链接。",errors.length?"error":"ok");
  }catch(error){setStatus("请求失败："+error.message,"error")}
  finally{convert.disabled=false}
});
clear.addEventListener("click",()=>{input.value="";warnings.innerHTML="";setStatus("");result.classList.remove("visible")});
copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(output.textContent);copy.textContent="已复制";setTimeout(()=>copy.textContent="复制",1200)}catch{setStatus("复制失败，请手动复制结果。","error")}});
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response(HTML, {
        headers: { "content-type": "text/html; charset=UTF-8" },
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method Not Allowed" }, 405);
    }

    if (!env.SECRET_KEY || !env.PROXY_DOMAIN) {
      return json({ error: "Worker 缺少 SECRET_KEY 或 PROXY_DOMAIN 密钥" }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "请求体必须是 JSON" }, 400);
    }

    if (!Array.isArray(body.links) || body.links.length === 0) {
      return json({ error: '请求体需要非空的 "links" 数组' }, 400);
    }

    if (body.links.length > 100) {
      return json({ error: "单次最多转换 100 条链接" }, 400);
    }

    const results = await Promise.all(
      body.links.map((link) => convertVless(link, env.SECRET_KEY, env.PROXY_DOMAIN))
    );
    return json({ results });
  },
};

async function convertVless(rawLink, secret, proxyDomain) {
  const link = typeof rawLink === "string" ? rawLink.trim() : "";
  const match = link.match(/^vless:\/\/([^@]+)@([^:/?#]+):(\d+)\?([^#]*)(?:#(.*))?$/i);
  if (!match) {
    return { ok: false, error: "无法解析 VLESS 链接" };
  }

  const [, uuid, address, port, rawQuery, fragment = ""] = match;
  const params = new URLSearchParams(rawQuery);
  const targetDomain = params.get("sni") || address;

  if (!targetDomain) {
    return { ok: false, error: "链接缺少目标域名" };
  }

  const token = await hmacSha256(targetDomain, secret);
  const path = params.get("path") || "/";
  const separator = path.includes("?") ? "&" : "?";

  params.set("sni", proxyDomain);
  if (params.has("host")) params.set("host", proxyDomain);
  params.set(
    "path",
    `${path}${separator}d=${encodeURIComponent(targetDomain)}&t=${token}`
  );

  const converted =
    `vless://${uuid}@${proxyDomain}:${port}?${params.toString()}` +
    (fragment ? `#${fragment}` : "");
  return { ok: true, converted };
}

async function hmacSha256(message, secret) {
  const text = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    text.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, text.encode(message));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
}
