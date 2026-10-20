export function referralShareUrl(username: string | null, whatsappUrl: string | null): string | null {
  const user = username?.trim();
  const phone = whatsappUrl?.match(/^https:\/\/wa\.me\/([1-9][0-9]{7,14})$/)?.[1];
  if (!user || !phone) return null;

  const message = [
    '¡Hola! Te recomiendo gana777bet.com 🎰',
    '',
    `Agendá este número como Gana777: +${phone}`,
    `Si todavía no tenés usuario, escribí y solicitá uno al instante: https://wa.me/${phone}`,
    '',
    `Cuando escribas, decí que te recomendó el usuario ${user}.`,
  ].join('\n');
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
