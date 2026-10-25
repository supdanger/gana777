function ascii(value: unknown, fallback: string) {
  const clean = String(value ?? '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 160);
  return clean || fallback;
}
async function sha256(bytes: BufferSource) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function canvasSignature() {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 60;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.textBaseline = 'alphabetic';
  context.font = '16px Arial';
  context.fillStyle = '#f60';
  context.fillRect(0, 0, 240, 60);
  context.fillStyle = '#069';
  context.fillText('GANA777 huella', 2, 20);
  context.fillStyle = 'rgba(102, 204, 0, 0.7)';
  context.fillText('GANA777 huella', 4, 40);
  context.strokeStyle = '#222';
  context.beginPath();
  context.arc(180, 30, 18, 0, Math.PI * 2);
  context.stroke();
  return context.getImageData(0, 0, 240, 60).data;
}
function rendererSignature() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl || !('getParameter' in gl)) return 'none';
  const webgl = gl as WebGLRenderingContext;
  const info = webgl.getExtension('WEBGL_debug_renderer_info');
  const renderer = info ? webgl.getParameter(info.UNMASKED_RENDERER_WEBGL) : webgl.getParameter(webgl.RENDERER);
  return ascii(renderer, 'none');
}

export async function deviceFootprint() {
  try {
    const pixels = canvasSignature();
    if (!pixels) return null;
    const canvas = await sha256(pixels);
    const ratio = Math.round((window.devicePixelRatio || 1) * 100);
    return {
      canvas,
      renderer: rendererSignature(),
      screen: ascii(`${screen.width}x${screen.height}x${ratio}`, '0x0x100'),
      cores: ascii(navigator.hardwareConcurrency || 0, '0'),
      touch: ascii(navigator.maxTouchPoints || 0, '0'),
      platform: ascii(navigator.platform, 'none'),
    };
  } catch {
    return null;
  }
}
