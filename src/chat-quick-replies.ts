export const chatQuickReplies = [
  { id: 'greeting', label: 'Saludo', body: 'Hola, ¿en qué podemos ayudarte?' },
  { id: 'deposit', label: 'Consultar carga', body: 'Para revisar tu carga, indicame el monto y la hora aproximada del envío del comprobante.' },
  { id: 'withdrawal', label: 'Consultar retiro', body: 'Para revisar tu retiro, indicame el monto y cuándo lo solicitaste.' },
  { id: 'access', label: 'Problema de acceso', body: 'Contame qué mensaje aparece al intentar ingresar. Si podés, adjuntá una captura sin contraseñas ni datos sensibles.' },
  { id: 'checking', label: 'Revisar consulta', body: 'Voy a revisar tu consulta. Te responderé por este chat cuando tenga la información.' },
  { id: 'closing', label: 'Confirmar solución', body: '¿Pudiste resolver tu consulta o necesitás ayuda con algo más?' },
] as const;

export function appendQuickReply(draft: string, reply: string): string | null {
  const combined = draft ? `${draft}\n${reply}` : reply;
  return combined.length <= 2000 ? combined : null;
}
