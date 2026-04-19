require('dotenv').config();
const { initDb, db } = require('./services/database');
async function check() {
    await initDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(r => r.name).join(', '));
}
check().catch(console.error);
