import { supabase, type RequestRow } from './lib';
import { InputError, parseUuid } from '../supabase/functions/_shared/validation';
import { safeHttpsLink } from './security';

export class DepositRateLimitError extends InputError {
  constructor(public retrySeconds: number) {
    super('Alcanzaste el límite de envíos. Esperá a que termine la cuenta regresiva.');
    this.name = 'DepositRateLimitError';
  }
}

export async function submitDeposit(form: FormData): Promise<RequestRow> {
  if (!supabase) throw new Error('Falta configurar Supabase.');
  const { data, error } = await supabase.functions.invoke('submit-deposit', { body: form });
  if (error) {
    let message = 'No pudimos enviar la carga. Intentá nuevamente.';
    let retrySeconds = 0;
    try {
      const response = error.context instanceof Response ? error.context : null;
      const payload: unknown = response ? await response.clone().json() : null;
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        && payload.error.length > 0 && payload.error.length <= 200 && !/[\u0000-\u001f\u007f]/.test(payload.error)) message = payload.error;
      if (response?.status === 429 && payload && typeof payload === 'object' && 'retry_after' in payload) {
        retrySeconds = Math.min(60, Math.max(1, Math.ceil(Number(payload.retry_after) || 0)));
      }
    } catch { /* A network failure might not have a response body. */ }
    if (retrySeconds > 0) throw new DepositRateLimitError(retrySeconds);
    throw new InputError(message);
  }
  if (!data?.request) throw new Error('El servidor no confirmó la carga.');
  return data.request as RequestRow;
}
export async function receiptUrl(request: RequestRow): Promise<string> {
  if (!supabase) throw new Error('Falta configurar Supabase.');
  if (request.receipt_url) {
    const { data, error } = await supabase.functions.invoke('receipt-url', { body: { request_id: parseUuid(request.id) } });
    if (error || !data?.url) throw new Error('No pudimos abrir el comprobante.');
    const url = safeHttpsLink(data.url, ['api.cloudinary.com']);
    if (!url) throw new InputError('No pudimos abrir el comprobante.');
    return url;
  }
  if (!request.receipt_path) throw new Error('Esta solicitud no tiene comprobante.');
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(request.receipt_path, 300);
  if (error) throw error;
  return data.signedUrl;
}
