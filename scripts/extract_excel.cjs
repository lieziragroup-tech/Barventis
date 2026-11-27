const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");

const folder = "Data Source";
const files = fs.readdirSync(folder).filter(f => f.endsWith('.xlsx'));
const result = {};

for (const file of files) {
  const filePath = path.join(folder, file);
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetInfo = {};
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      
      const columns = data.length > 0 ? data[0] : [];
      const samples = data.slice(1, 4);
      
      sheetInfo[sheetName] = {
        columns,
        samples
      };
    }
    result[file] = sheetInfo;
  } catch (e) {
    result[file] = { error: e.message };
  }
}

fs.writeFileSync(path.join(folder, "analysis.json"), JSON.stringify(result, null, 2));
console.log("Done");
