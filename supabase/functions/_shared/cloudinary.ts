export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta configurar ${name} en el servidor.`);
  return value;
}
export async function signature(params: Record<string, string>, secret: string): Promise<string> {
  const value = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&') + secret;
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function signedParams(params: Record<string, string>): Promise<URLSearchParams> {
  return new URLSearchParams({ ...params, signature: await signature(params, requiredEnv('CLOUDINARY_API_SECRET')), api_key: requiredEnv('CLOUDINARY_API_KEY') });
}
export function cloudName(): string {
  const name = requiredEnv('CLOUDINARY_CLOUD_NAME');
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Cloud name inválido.');
  return name;
}
const storedReceiptPattern = /^https:\/\/res\.cloudinary\.com\/([a-zA-Z0-9_-]+)\/image\/authenticated\/(?:s--[A-Za-z0-9_-]{8}--\/)?v\d+\/(receipts\/[0-9a-f-]{36}\/[0-9a-f-]{36})\.(png|jpe?g|webp|pdf)$/i;
export function storedReceipt(secureUrl: string, cloud: string): { publicId: string; format: string } | null {
  let url: URL;
  try { url = new URL(secureUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
  const match = storedReceiptPattern.exec(`${url.origin}${url.pathname}`);
  if (!match || match[1] !== cloud) return null;
  const format = match[3].toLowerCase();
  return { publicId: match[2].toLowerCase(), format: format === 'jpeg' ? 'jpg' : format };
}
export async function receiptViewUrl(secureUrl: string): Promise<string> {
  const cloud = cloudName();
  const receipt = storedReceipt(secureUrl, cloud);
  if (!receipt) throw new Error('Comprobante inválido.');
  const now = Math.floor(Date.now() / 1000);
  const params = await signedParams({ attachment: 'false', expires_at: String(now + 300), format: receipt.format, public_id: receipt.publicId, timestamp: String(now), type: 'authenticated' });
  return `https://api.cloudinary.com/v1_1/${cloud}/image/download?${params}`;
}
export async function destroyReceipt(publicId: string): Promise<void> {
  const body = await signedParams({ public_id: publicId, type: 'authenticated', timestamp: String(Math.floor(Date.now() / 1000)) });
  const result = await fetch(`https://api.cloudinary.com/v1_1/${cloudName()}/image/destroy`, { method: 'POST', body, signal: AbortSignal.timeout(15000) });
  if (!result.ok) throw new Error('No se pudo limpiar el comprobante sin solicitud.');
}
