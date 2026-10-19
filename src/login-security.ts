export const LOGIN_RETRY_SECONDS = 60;
const retryKey = 'gana777:login-retry-at';
export function loginFailure(error: unknown): { message: string; retrySeconds: number } {
  const value = error && typeof error === 'object' ? error as { status?: unknown; code?: unknown; name?: unknown } : {};
  if (value.status === 429 || value.code === 'over_request_rate_limit') return {
    message: 'Se alcanzó el límite de intentos. Esperá un minuto antes de volver a intentar.', retrySeconds: LOGIN_RETRY_SECONDS,
  };
  if (value.code === 'captcha_failed') return {
    message: 'No pudimos validar la verificación de seguridad. Volvé a completarla.', retrySeconds: 0,
  };
  if (value.name === 'AuthRetryableFetchError') return {
    message: 'No pudimos conectar con el servicio de acceso. Intentá nuevamente en unos momentos.', retrySeconds: 0,
  };
  // Never disclose whether the account exists.
  return { message: 'No pudimos ingresar. Verificá tu correo y contraseña.', retrySeconds: 0 };
}
export function readLoginRetryAt(now = Date.now()): number {
  try {
    const stored = Number(sessionStorage.getItem(retryKey));
    return Number.isFinite(stored) && stored > now && stored <= now + LOGIN_RETRY_SECONDS * 1000 ? stored : 0;
  } catch { return 0; }
}
export function saveLoginRetryAt(deadline: number): void {
  try { if (deadline) sessionStorage.setItem(retryKey, String(deadline)); else sessionStorage.removeItem(retryKey); }
  catch { /* Storage availability must not control server authorization. */ }
}
