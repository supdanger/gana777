export const USER_HISTORY_PAGE_SIZE = 5;

export function userHistoryWindow(page: number, total: number) {
  const pages = Math.max(1, Math.ceil(Math.max(0, total) / USER_HISTORY_PAGE_SIZE));
  const current = Math.min(Math.max(0, Math.trunc(page)), pages - 1);
  const from = current * USER_HISTORY_PAGE_SIZE;
  return { current, pages, from, to: Math.min(from + USER_HISTORY_PAGE_SIZE, Math.max(0, total)) };
}
