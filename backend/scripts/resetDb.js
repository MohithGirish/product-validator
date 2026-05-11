const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/app.db');

if (!fs.existsSync(dbPath)) {
  console.log('No database file found at', dbPath);
  process.exit(0);
}

fs.unlinkSync(dbPath);
console.log('Deleted database:', dbPath);
console.log('Run `npm run start` or `npm run dev` in backend to recreate and reseed.');
