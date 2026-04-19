require('dotenv').config({ path: 'C:/Users/vieve/.openclaw/workspace/sky-store/.env' });
const { initDb, db } = require('./services/database');

async function test() {
    await initDb();
    console.log('=== Test INSERT + lastInsertRowid ===');

    const r = db.prepare('INSERT INTO orders (user_id, status, total, free_photo_credit) VALUES (?, ?, ?, ?)').run(null, 'pending', 2000, 1);
    console.log('INSERT result:', JSON.stringify(r));
    console.log('lastInsertRowid:', r.lastInsertRowid);
    console.log('changes:', r.changes);

    const orders = db.prepare('SELECT id, status, total FROM orders ORDER BY id DESC LIMIT 3').all();
    console.log('Orders:', JSON.stringify(orders));

    console.log('\n=== Test SELECT ===');
    const sel = db.prepare('SELECT 1 as n').get();
    console.log('SELECT:', JSON.stringify(sel));

    process.exit(0);
}

test().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
