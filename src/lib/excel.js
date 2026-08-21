// Minimal Excel (.xlsx) export helper — mirrors downloadCSV's signature
// (filename, rows of objects) so it's a drop-in alongside CSV export buttons.
import * as XLSX from "xlsx";

export function downloadExcel(filename, rows) {
  if (!rows || rows.length === 0) {
    rows = [{ notice: "No data available" }];
  }
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
