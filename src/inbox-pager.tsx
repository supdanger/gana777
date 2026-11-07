import { INBOX_PAGE_SIZE, type InboxPagination } from './inbox-data';

export function InboxPager({ pagination }: { pagination?: InboxPagination }) {
  if (!pagination) return null;
  const pages = Math.max(1, Math.ceil(pagination.total / INBOX_PAGE_SIZE));
  return <div className="inbox-pager" aria-label="Páginas de conversaciones">
    {pagination.loading && <span role="status">Actualizando…</span>}
    {pages > 1 && <><button type="button" disabled={pagination.loading || pagination.page === 0} onClick={() => pagination.onPage(pagination.page - 1)}>Anterior</button><span>{pagination.page + 1} de {pages}</span><button type="button" disabled={pagination.loading || pagination.page + 1 >= pages} onClick={() => pagination.onPage(pagination.page + 1)}>Siguiente</button></>}
  </div>;
}
