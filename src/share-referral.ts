export function referralShareUrl(username: string | null, whatsappUrl: string | null): string | null {
  const user = username?.trim();
  const phone = whatsappUrl?.match(/^https:\/\/wa\.me\/([1-9][0-9]{7,14})$/)?.[1];
  if (!user || !phone) return null;

  const message = [
    '¡Hola! Te recomiendo Gana777 🎰',
    `Agendanos como Gana777: +${phone}`,
    `Podés escribirnos acá: https://wa.me/${phone}`,
    'Si todavía no tenés usuario, podés solicitar uno al instante.',
    `Decí que te recomendó el usuario ${user}.`,
  ].join('\n');
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
