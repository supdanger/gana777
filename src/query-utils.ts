// PostgREST OR expressions are syntax, not plain search strings. Strip their
// delimiters and escape LIKE wildcards before interpolating a search term.
export function searchPattern(value: string): string {
  return value.trim().replace(/^@/, '').replace(/[(),"\\%*]/g, ' ').replace(/\s+/g, ' ').slice(0, 80).trim();
}

export function searchFilter(fields: string[], value: string): string {
  // Quoted PostgREST values preserve dots in usernames. The double backslash
  // survives its quoted-value parser and escapes '_' as a literal LIKE value.
  const pattern = searchPattern(value).replace(/_/g, '\\\\_');
  return fields.map(field => `${field}.ilike."*${pattern}*"`).join(',');
}

export function mergeMessages<T extends { id: string; created_at: string }>(old: T[], incoming: T[]): T[] {
  const byId = new Map(old.map(row => [row.id, row]));
  for (const row of incoming) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export const REQUEST_PAGE_SIZE = 10;
export const MESSAGE_PAGE_SIZE = 50;
