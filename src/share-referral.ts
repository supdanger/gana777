export function referralShareMessage(username: string | null, whatsappUrl: string | null): string | null {
  const user = username?.trim();
  const phone = whatsappUrl?.match(/^https:\/\/wa\.me\/([1-9][0-9]{7,14})$/)?.[1];
  if (!user || !phone) return null;

  return [
    '*Te recomiendo gana777bet.com* 🎰',
    '',
    '*Agendá este número*',
    `+${phone} como Gana777`,
    '',
    '*¿Todavía no tenés usuario?*',
    'Escribinos por WhatsApp con tu nombre y te creamos la cuenta al instante:',
    `https://wa.me/${phone}`,
    '',
    `*Recomendado por:* ${user}`,
  ].join('\n');
}

export function referralShareUrl(username: string | null, whatsappUrl: string | null): string | null {
  const message = referralShareMessage(username, whatsappUrl);
  if (!message) return null;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
