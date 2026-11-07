let registration: Promise<ServiceWorkerRegistration> | null = null;

export function registerPortalWorker(): Promise<ServiceWorkerRegistration> {
  if (!registration) {
    registration = navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(error => {
      registration = null;
      throw error;
    });
  }
  return registration;
}
