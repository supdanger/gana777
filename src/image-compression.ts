import { InputError } from '../supabase/functions/_shared/validation.ts';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const TARGET_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 2048;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function scaledDimensions(width: number, height: number, maxSide = MAX_SIDE) {
  if (width <= 0 || height <= 0) throw new InputError('No pudimos leer las dimensiones del comprobante.');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function compressedReceiptName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim() || 'comprobante';
  return `${base}.jpg`;
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new InputError('No pudimos comprimir el comprobante.')),
    'image/jpeg',
    quality,
  ));
}

export async function compressReceipt(file: File): Promise<File> {
  if (!file.size) throw new InputError('El comprobante está vacío.');
  if (file.type === 'application/pdf') {
    if (file.size > 5 * 1024 * 1024) throw new InputError('El PDF supera el límite de 5 MB.');
    return file;
  }
  if (!IMAGE_TYPES.has(file.type)) throw new InputError('El comprobante debe ser una imagen JPG, PNG, WebP o un PDF válido.');
  if (file.size > MAX_SOURCE_BYTES) throw new InputError('La imagen es demasiado grande. Elegí una de hasta 20 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new InputError('No pudimos leer esa imagen. Probá con otra captura.');
  }

  try {
    let dimensions = scaledDimensions(bitmap.width, bitmap.height);
    let best: Blob | null = null;
    for (const quality of [0.88, 0.8, 0.72]) {
      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext('2d');
      if (!context) throw new InputError('Tu navegador no pudo optimizar la imagen.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      best = await canvasBlob(canvas, quality);
      canvas.width = 1;
      canvas.height = 1;
      if (best.size <= TARGET_BYTES) break;
      dimensions = scaledDimensions(dimensions.width, dimensions.height, Math.round(Math.max(dimensions.width, dimensions.height) * 0.82));
    }

    if (!best) throw new InputError('No pudimos comprimir el comprobante.');
    if (file.size <= 5 * 1024 * 1024 && best.size >= file.size) return file;
    if (best.size > 5 * 1024 * 1024) throw new InputError('No pudimos reducir la imagen a menos de 5 MB. Probá con otra captura.');
    return new File([best], compressedReceiptName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

export function readableFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
