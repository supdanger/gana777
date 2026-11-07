import { supabase, type RequestRow } from './lib';
import { cachedResource } from './resource-cache';
import { InputError } from '../supabase/functions/_shared/validation';

export type DepositQueueFilter = 'available' | 'mine' | 'all';
export type DepositClaim = {
  claimed_by: string | null; claimed_name: string | null; claim_token: string | null;
  claimed_at: string | null; credit_started_at: string | null;
};
export type QueueDeposit = RequestRow & Partial<DepositClaim>;
export const queueMessages = [
  'La carga ya fue tomada por otro compañero. Actualizá la bandeja.',
  'La asignación de esta carga cambió. Volvé a abrirla.',
  'La carga ya no está disponible.',
  'Esta carga fue archivada como prueba.',
  'Una carga aceptada requiere revisión del supervisor para cambiar de responsable.',
  'Escribí un motivo de entre 5 y 300 caracteres.',
  'No tenés permiso para operar esta carga.',
] as const;

export async function depositQueueEnabled(userId: string): Promise<boolean> {
  return cachedResource(`deposit-queue-mode:${userId}`, 60_000, async () => {
    const { data, error } = await supabase!.rpc('get_deposit_queue_mode');
    if (error?.code === 'PGRST202' || error?.code === '42883') return false;
    if (error) throw error;
    if (data !== 1) throw new Error('Unsupported deposit queue version');
    return true;
  });
}

function queueError(error: { message?: string }) {
  if (queueMessages.some(message => message === error.message)) return new InputError(error.message!);
  return error;
}

export async function readDepositQueue(filter: DepositQueueFilter, page: number, signal: AbortSignal) {
  const { data, error } = await supabase!.rpc('list_deposit_queue', { p_filter: filter, p_page: page }).abortSignal(signal);
  if (error) throw queueError(error);
  const result = data as { rows: QueueDeposit[]; total: number; pending_count: number };
  if (!result || !Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || !Number.isSafeInteger(result.pending_count)) throw new Error('Invalid deposit queue response');
  return result;
}

export async function takeDeposit(id: string): Promise<QueueDeposit> {
  const { data, error } = await supabase!.rpc('take_deposit', { p_request_id: id });
  if (error) throw queueError(error);
  return data as QueueDeposit;
}

export async function releaseDeposit(row: QueueDeposit) {
  const { error } = await supabase!.rpc('release_deposit', { p_request_id: row.id, p_token: row.claim_token });
  if (error) throw queueError(error);
}

export async function reassignDeposit(row: QueueDeposit, reason: string): Promise<QueueDeposit> {
  const { data, error } = await supabase!.rpc('reassign_deposit', { p_request_id: row.id, p_token: row.claim_token ?? null, p_reason: reason });
  if (error) throw queueError(error);
  return data as QueueDeposit;
}

export async function reviewQueueDeposit(row: QueueDeposit, status: 'approved' | 'rejected', amount: number | null, bonus: boolean): Promise<QueueDeposit> {
  const { data, error } = await supabase!.rpc('review_queue_deposit', { p_request_id: row.id, p_token: row.claim_token, p_status: status, p_actual_amount: amount, p_apply_bonus: bonus });
  if (error) throw queueError(error);
  return { ...row, ...data } as QueueDeposit;
}

export async function confirmQueueCredit(row: QueueDeposit) {
  const { data, error } = await supabase!.rpc('confirm_queue_deposit_credit', { p_request_id: row.id, p_token: row.claim_token });
  if (error) throw queueError(error);
  return data as { notification_id: string; newly_credited: boolean };
}

export function ownsDeposit(row: QueueDeposit, actor: string): boolean {
  return !!actor && row.claimed_by === actor && !!row.claim_token;
}

export function depositClaimLabel(row: QueueDeposit, actor: string): string {
  if (row.credited_at || row.status === 'approved') return 'Cargada';
  if (row.status === 'rejected') return 'Rechazada';
  if (ownsDeposit(row, actor)) return 'Tomada por vos';
  if (row.claimed_by) return `En atención por ${row.claimed_name || 'otro compañero'}`;
  return 'Disponible';
}
