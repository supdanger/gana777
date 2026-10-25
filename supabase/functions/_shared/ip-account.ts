export type IpAccountRow = {
  id: string;
  username: string;
  status: string;
  player_user_id?: string | null;
  ip_blocked?: boolean | null;
};

// Un celular que ya tiene una cuenta creada, o una solicitud todavía abierta, no puede abrir otra.
// La red compartida no entra en esta decisión. Un aviso de un intento anterior tampoco cuenta como cuenta.
export function pickExistingIpAccount(rows: readonly IpAccountRow[]): IpAccountRow | null {
  const approved = rows.find(row => row.status === 'approved' && Boolean(row.player_user_id));
  if (approved) return approved;
  return rows.find(row => row.status === 'pending' && !row.ip_blocked) ?? null;
}
