export type IpAccountRow = {
  id: string;
  username: string;
  status: string;
  player_user_id?: string | null;
  ip_blocked?: boolean | null;
};

// Una IP ya usada por una cuenta creada, o por una solicitud todavía abierta, no puede abrir otra.
// Los avisos de un intento anterior no cuentan como cuenta.
export function pickExistingIpAccount(rows: readonly IpAccountRow[]): IpAccountRow | null {
  const approved = rows.find(row => row.status === 'approved' && Boolean(row.player_user_id));
  if (approved) return approved;
  return rows.find(row => row.status === 'pending' && !row.ip_blocked) ?? null;
}
