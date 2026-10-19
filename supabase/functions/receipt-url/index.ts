import { authenticate, cors, HttpError, json } from '../_shared/http.ts';
import { cloudName, receiptViewUrl, storedReceipt } from '../_shared/cloudinary.ts';
import { InputError, parseUuid } from '../_shared/validation.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  try {
    const { db } = await authenticate(request);
    const { data: allowed, error: roleError } = await db.rpc('has_admin_permission', { permission_name: 'deposit' });
    if (roleError || !allowed) return json({ error: 'No tenés acceso a los comprobantes.' }, 403);
    if (Number(request.headers.get('Content-Length') ?? 0) > 4096) return json({ error: 'Solicitud no válida.' }, 413);
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 1 || !('request_id' in payload)) return json({ error: 'Solicitud no válida.' }, 400);
    const id = parseUuid(payload.request_id);
    const { data, error } = await db.from('requests').select('receipt_url,cloudinary_asset_id').eq('id', id).single();
    if (error || !data?.cloudinary_asset_id || typeof data.receipt_url !== 'string' || !storedReceipt(data.receipt_url, cloudName())) return json({ error: 'Comprobante no encontrado.' }, 404);
    return json({ url: await receiptViewUrl(data.receipt_url) });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof InputError || error instanceof SyntaxError) return json({ error: 'Solicitud no válida.' }, 400);
    return json({ error: 'No pudimos abrir el comprobante.' }, 500);
  }
});
