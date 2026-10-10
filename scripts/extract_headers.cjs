const xlsx = require("xlsx");
const fs = require("fs");

const files = [
  "Data Source/SO BARISTA AGUSTUS KASUNA.xlsx",
  "Data Source/SO BARISTA AGUSTUS 2026 (1).xlsx"
];

const sheetsToAnalyze = [
  "MARKETLIST ", 
  "Pembelian Harian", 
  "Pemakaian Harian", 
  "Daily Iventory Bahan ", 
  "COGS All Beverage ", 
  "COST CONTROL"
];

const result = {};

for (const file of files) {
  const workbook = xlsx.readFile(file);
  result[file] = {};
  
  for (const sheetName of sheetsToAnalyze) {
    if (!workbook.Sheets[sheetName]) continue;
    
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
    
    let headerRowIdx = 0;
    let maxCols = 0;
    for (let i = 0; i < 10 && i < data.length; i++) {
      const filledCols = data[i].filter(cell => String(cell).trim() !== "").length;
      if (filledCols > maxCols) {
        maxCols = filledCols;
        headerRowIdx = i;
      }
    }
    
    if (data[headerRowIdx]) {
      const headers = data[headerRowIdx].map(h => String(h).trim()).filter(h => h !== "");
      result[file][sheetName.trim()] = headers.slice(0, 20);
    }
  }
}

console.log(JSON.stringify(result, null, 2));
