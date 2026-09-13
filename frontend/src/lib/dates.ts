/**
 * Vergleicht einen Zellwert mit dem im Filter gewaehlten Datum.
 *
 * AG Grids Datumsfilter erwartet von Haus aus Date-Objekte in den Zellen. Das
 * Backend liefert die Zeitstempel aber als ISO-Strings, weshalb der eingebaute
 * Vergleich wirkungslos bleibt: die Spalte zeigt zwar einen Kalender, filtert aber
 * nicht. Dieser Comparator schliesst die Luecke.
 *
 * Verglichen wird nur der Tag. Die Uhrzeit im Zellwert wuerde sonst jeden
 * "gleich"-Vergleich gegen das auf Mitternacht gesetzte Filterdatum scheitern
 * lassen. Beide Seiten werden in lokaler Zeit betrachtet, damit der Filter zu dem
 * passt, was die Spalte ueber toLocaleDateString anzeigt.
 *
 * Rueckgabe nach AG-Grid-Konvention: negativ, wenn die Zelle vor dem Filterdatum
 * liegt, positiv danach, 0 bei Gleichheit.
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
