import { authenticate, cors, HttpError, json, serverClient } from '../_shared/http.ts';
import { cloudName, destroyReceipt, signedParams } from '../_shared/cloudinary.ts';
import { asBonusRule, bonusEnabled } from '../_shared/bonus-rule.ts';
import { assertFormFields, InputError, parseAmount, parseUuid, validateReceipt } from '../_shared/validation.ts';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  let uploadedId: string | null = null;
  let saved = false;
  try {
    const { db, user } = await authenticate(request);
    if (Number(request.headers.get('Content-Length') ?? 0) > 6 * 1024 * 1024) return json({ error: 'El comprobante supera los 5 MB.' }, 413);
    const form = await request.formData();
    assertFormFields(form, ['amount', 'bonus_id', 'bank_assignment_id', 'receipt']);
    const amount = parseAmount(form.get('amount'));
    const file = await validateReceipt(form.get('receipt'));
    const bankAssignmentId = parseUuid(form.get('bank_assignment_id'));
    const { data: pendingDeposit, error: pendingError } = await db.from('requests').select('id').eq('user_id', user.id).eq('kind', 'deposit').eq('status', 'pending').limit(1).maybeSingle();
    if (pendingError) return json({ error: 'No pudimos verificar tus cargas pendientes. Intentá nuevamente.' }, 503);
    if (pendingDeposit) return json({ error: 'Ya tenés una carga pendiente. Esperá a que sea aprobada o rechazada.' }, 409);
    const rawBonusId = form.get('bonus_id');
    const bonusId = rawBonusId === null || rawBonusId === '' ? null : parseUuid(rawBonusId);
    if (bonusId) {
      const lookup = await db.from('promotions').select('bonus_mode,bonus_percent,bonus_amount,min_amount,max_amount').eq('id', bonusId).eq('active', true).eq('selectable', true).maybeSingle();
      const missingRule = lookup.error && /bonus_mode|bonus_amount|min_amount|max_amount/i.test(lookup.error.message ?? '');
      if (missingRule) {
        const legacy = await db.from('promotions').select('id').eq('id', bonusId).eq('active', true).eq('selectable', true).gt('bonus_percent', 0).maybeSingle();
        if (!legacy.data) return json({ error: 'El bono seleccionado ya no está disponible.' }, 400);
      } else if (lookup.error) return json({ error: 'No pudimos validar el bono. Intentá nuevamente.' }, 503);
      else if (!lookup.data || !bonusEnabled(asBonusRule(lookup.data), amount)) return json({ error: 'El bono no está habilitado para ese monto.' }, 400);
    }
    const { data: retryAfterData, error: limitError } = await db.rpc('reserve_receipt_upload');
    if (limitError) return json({ error: 'No pudimos procesar el envío.' }, 503);
    const retryAfter = Math.max(0, Math.ceil(Number(retryAfterData) || 0));
    if (retryAfter > 0) return json({ error: 'Alcanzaste el límite de envíos.', retry_after: retryAfter }, 429);
    const publicId = `receipts/${user.id}/${crypto.randomUUID()}`;
    const params = await signedParams({ public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'authenticated', overwrite: 'false' });
    const upload = new FormData();
    params.forEach((value, key) => upload.set(key, value));
    upload.set('file', file);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName()}/image/upload`, { method: 'POST', body: upload, signal: AbortSignal.timeout(45000) });
    const result = await response.json();
    if (!response.ok) return json({ error: 'Cloudinary no pudo guardar el comprobante. Volvé a intentar.' }, 502);
    uploadedId = result.public_id;
    const expected = `https://res.cloudinary.com/${cloudName()}/image/authenticated/`;
    if (typeof result.secure_url !== 'string' || !result.secure_url.startsWith(expected) || typeof result.asset_id !== 'string') throw new Error('Cloudinary devolvió un comprobante inválido.');
    const { data, error } = await serverClient().from('requests').insert({ user_id: user.id, kind: 'deposit', amount,
      receipt_url: result.secure_url, cloudinary_asset_id: result.asset_id, bonus_id: bonusId, bank_assignment_id: bankAssignmentId,
    }).select('id,user_id,kind,amount,status,created_at,holder,cbu,alias,receipt_path,receipt_url,bonus_id,bonus_percent').single();
    if (error) {
      if ((error.message ?? '').includes('El bono no está habilitado')) return json({ error: 'El bono no está habilitado para ese monto.' }, 400);
      if ((error.message ?? '').includes('asignación de la cuenta venció')) return json({ error: 'La asignación de la cuenta venció. Volvé a iniciar la carga.' }, 400);
      if ((error.message ?? '').includes('cuenta asignada ya no está disponible')) return json({ error: 'La cuenta asignada ya no está disponible.' }, 400);
      if ((error.message ?? '').includes('Ya tenés una carga pendiente')) return json({ error: 'Ya tenés una carga pendiente. Esperá a que sea aprobada o rechazada.' }, 409);
      throw new Error('No pudimos registrar la carga. Verificá el bono y volvé a intentar.');
    }
    saved = true;
    return json({ request: data }, 201);
  } catch (error) {
    if (error instanceof InputError) return json({ error: error.message }, 400);
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('submit-deposit failed', { type: error instanceof Error ? error.name : 'unknown' });
    return json({ error: 'No pudimos enviar la carga. Intentá nuevamente.' }, 500);
  } finally {
    if (uploadedId && !saved) {
      try { await destroyReceipt(uploadedId); } catch { console.error('Cloudinary cleanup pending for an unregistered receipt.'); }
    }
  }
});
