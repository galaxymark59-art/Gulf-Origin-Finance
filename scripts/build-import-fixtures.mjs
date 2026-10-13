import ExcelJS from 'exceljs';
import {writeFile} from 'node:fs/promises';
const rows=[['Merchant name','Opening balance','Date','Payment','Reference','Balance'],['Fictional Shop',5000,'2025-10-14',1000,'OLD-001',4000],['Fictional Shop','','2026-10-01',500,'OLD-002',3500]];
const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('Merchant records');rows.forEach(r=>ws.addRow(r));await wb.xlsx.writeFile('docs/qa/import-existing.xlsx');
await writeFile('docs/qa/import-existing.csv',rows.map(r=>r.join(',')).join('\n'));
console.log('Fictional CSV and Excel import files created.');
