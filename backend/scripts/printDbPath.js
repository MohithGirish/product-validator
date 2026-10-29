// Prints the path of the local SQLite fallback file (npm run db:path).
// Has no meaning when the app runs on Turso.

const path = require('path');

const dbPath = path.resolve(__dirname, '../data/app.db');
console.log(dbPath);
