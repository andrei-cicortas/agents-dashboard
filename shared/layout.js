// Grid math shared by the UI and the tests.

export const MAX_COLUMNS = 4;
export const MAX_VISIBLE_ROWS = 3;

export function gridSize(count) {
  if (count <= 0) return { columns: 0, rows: 0 };
  const columns = Math.min(MAX_COLUMNS, Math.ceil(Math.sqrt(count)));
  return { columns, rows: Math.ceil(count / columns) };
}
