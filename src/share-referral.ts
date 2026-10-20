export function referralShareUrl(username: string | null, whatsappUrl: string | null): string | null {
  const user = username?.trim();
  const phone = whatsappUrl?.match(/^https:\/\/wa\.me\/([1-9][0-9]{7,14})$/)?.[1];
  if (!user || !phone) return null;

  const message = [
    '*Te recomiendo gana777bet.com* 🎰',
    '',
    '*Agendá este contacto*',
    `Gana777 · +${phone}`,
    '',
    '*¿Todavía no tenés usuario?*',
    'Pedilo al instante por WhatsApp:',
    `https://wa.me/${phone}`,
    '',
    `*Recomendado por:* ${user}`,
  ].join('\n');
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
