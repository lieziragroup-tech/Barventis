import { seededItems, seededRecipes } from './src/data/seededData.js';
import fs from 'fs';

const data = {
  items: seededItems,
  recipes: seededRecipes
};

// Make sure target directory exists
if (!fs.existsSync('../umatis-api/database/seeders')) {
  fs.mkdirSync('../umatis-api/database/seeders', { recursive: true });
}

fs.writeFileSync(
  '../umatis-api/database/seeders/tenant_seed_data.json',
  JSON.stringify(data, null, 2)
);
console.log("Sanitized seed data exported to Laravel successfully!");
