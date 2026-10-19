export const DEPOSIT_PAGE_SIZE = 30;

export function depositWindow(page: number, total: number, size = DEPOSIT_PAGE_SIZE) {
  const safeTotal = Math.max(0, total);
  const pages = Math.max(1, Math.ceil(safeTotal / size));
  const current = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const from = current * size;
  return { current, pages, from, to: from + size - 1 };
}
