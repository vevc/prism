// ==================== 配置区域 ====================
// 建议：使用一个长度不低于 32 位的随机高强度文本字符串
const SECRET_KEY = "your_32_byte_or_longer_secure_secret_key_here";
// ==================================================

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      
      // 读取简写参数：d = domain, t = token
      const targetDomain = url.searchParams.get('d');
      const receivedToken = url.searchParams.get('t');

      // 1. 基础校验（只要缺少任何一个参数，直接报错）
      if (!targetDomain || !receivedToken) {
        return new Response("Bad Request", { status: 400 });
      }

      // 2. 校验签名是否合法
      const isValid = await verifyHMAC(targetDomain, receivedToken, SECRET_KEY);
      if (!isValid) {
        return new Response("Forbidden", { status: 403 });
      }

      // 3. 校验通过，重写目标域名并透传（自动支持 WebSocket）
      url.hostname = targetDomain;
      return await fetch(url, request);

    } catch (error) {
      // 4. 捕获任何运行时未知错误
      return new Response("Internal Server Error", { status: 500 });
    }
  }
};

/**
 * 使用 Web Crypto API 校验 HMAC-SHA256 签名
 */
async function verifyHMAC(message, receivedHexToken, secretStr) {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretStr);
    const messageData = encoder.encode(message);

    // 导入硬编码的原始文本密钥
    const cryptoKey = await crypto.subtle.importKey(
      "raw", 
      keyData,
      { name: "HMAC", hash: { name: "SHA-256" } },
      false, 
      ["verify"]
    );

    // 将前端传来的 Hex 字符串还原为 Uint8Array 字节流
    const tokenBuffer = new Uint8Array(
      receivedHexToken.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16))
    );

    // 执行底层的加密校验
    return await crypto.subtle.verify(
      "HMAC", 
      cryptoKey, 
      tokenBuffer, 
      messageData
    );
  } catch (e) {
    // 任何格式解析错误（如 Hex 字符串格式不合规）直接判定为校验失败
    return false; 
  }
}
