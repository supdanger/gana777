import { REQUEST_COLUMNS, REQUEST_COLUMNS_LEGACY, supabase, type RequestRow, type WithdrawalPart } from './lib';

export type RequestPageOptions = {
  userId?: string; kind?: RequestRow['kind']; status?: RequestRow['status'];
  resolved?: boolean; page?: number; size: number; ascending?: boolean;
  latestApproved?: boolean; signal?: AbortSignal; count?: boolean;
};

export async function readRequestPage(options: RequestPageOptions): Promise<{ rows: RequestRow[]; total: number }> {
  if (!supabase) return { rows: [], total: 0 };
  const query = (columns: string) => {
    let request = supabase!.from('request_summaries').select(columns, options.count === false ? {} : { count: 'exact' });
    if (options.userId) request = request.eq('user_id', options.userId);
    if (options.kind) request = request.eq('kind', options.kind);
    if (options.status) request = request.eq('status', options.status);
    if (options.resolved) request = request.neq('status', 'pending');
    if (options.latestApproved) request = request.order('approved_at', { ascending: false, nullsFirst: false });
    request = request.order('created_at', { ascending: options.ascending ?? false }).order('id', { ascending: options.ascending ?? false });
    const from = (options.page ?? 0) * options.size;
    request = request.range(from, from + options.size - 1);
    if (options.signal) request = request.abortSignal(options.signal);
    return request;
  };
  let result = await query(REQUEST_COLUMNS);
  if (result.error && /bonus_amount|requested_special_bonus_id|bonus_reward_type|bonus_reward_label|bonus_load_number|deposit_sac|deposit_phone|deposit_holder/i.test(result.error.message ?? '')) result = await query(REQUEST_COLUMNS_LEGACY);
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as unknown as RequestRow[];
  return { rows: rows.map(row => ({ ...row, bonus_amount: Number(row.bonus_amount) || 0 })), total: result.count ?? rows.length };
}

export async function readWithdrawalParts(ids: string[], signal?: AbortSignal): Promise<WithdrawalPart[]> {
  if (!supabase || !ids.length) return [];
  // A withdrawal may contain 100 parts. Read explicit batches so the API row
  // limit never silently drops receipts from a page containing several requests.
  const rows: WithdrawalPart[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    let query = supabase.from('withdrawal_parts')
      .select('request_id,part_number,amount,receipt_path,paid_at,source_bank_account_id,source_bank_name,source_alias')
      .in('request_id', ids.slice(i, i + 5)).order('request_id').order('part_number').limit(500);
    if (signal) query = query.abortSignal(signal);
    const result = await query;
    if (result.error) throw result.error;
    rows.push(...((result.data ?? []) as WithdrawalPart[]));
  }
  return rows;
}
