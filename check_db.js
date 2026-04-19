const path = require('path');
const fs = require('fs');
const initSqlJs = require('./node_modules/sql.js');

async function main() {
    const SQL = await initSqlJs();
    const dbPath = path.join(__dirname, 'data', 'sky-store.db');
    console.log("DB path:", dbPath);
    console.log("DB exists:", fs.existsSync(dbPath));
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);

    const orders = db.exec("SELECT * FROM orders WHERE user_id = 58 ORDER BY id DESC LIMIT 5");
    if (orders.length > 0 && orders[0].values && orders[0].values.length > 0) {
        console.log("=== ORDERS FOR USER 58 ===");
        const cols = orders[0].columns;
        orders[0].values.forEach(row => {
            const obj = {};
            cols.forEach((c, i) => obj[c] = row[i]);
            console.log(JSON.stringify(obj));
        });
    } else {
        console.log("No orders found for user 58");
    }

    const allOrders = db.exec("SELECT id, user_id, status, total, created_at FROM orders ORDER BY id DESC LIMIT 10");
    if (allOrders.length > 0 && allOrders[0].values.length > 0) {
        console.log("\n=== ALL RECENT ORDERS ===");
        const cols = allOrders[0].columns;
        allOrders[0].values.forEach(row => {
            const obj = {};
            cols.forEach((c, i) => obj[c] = row[i]);
            console.log(JSON.stringify(obj));
        });
    } else {
        console.log("No orders at all");
    }
}

main().catch(console.error);
