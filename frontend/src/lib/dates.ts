/**
 * Comparator for AG Grid's date filter. The filter expects Date objects, the backend
 * sends ISO strings, so without this the column shows a calendar but does not filter.
 *
 * Compares the day only and in local time, matching what toLocaleDateString renders.
 * Returns negative / positive / 0 per AG Grid convention.
 */
export function compareSheetDate(filterDate: Date, cellValue: unknown): number {
  if (cellValue == null) return -1;

  const cellDate = cellValue instanceof Date ? cellValue : new Date(String(cellValue));
  if (Number.isNaN(cellDate.getTime())) return -1;

  const cellDay = new Date(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate()).getTime();
  const filterDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate()).getTime();

  if (cellDay < filterDay) return -1;
  if (cellDay > filterDay) return 1;
  return 0;
}
