const path = require('path');
const fs = require('fs');
const initSqlJs = require('./node_modules/sql.js');

async function main() {
    const SQL = await initSqlJs();
    const dbPath = path.join(__dirname, 'data', 'sky-store.db');
    const buf = fs.readFileSync(dbPath);
    const db = new SQL.Database(buf);

    // Check order_items for order 28
    const items = db.exec("SELECT * FROM order_items WHERE order_id = 28");
    if (items.length > 0 && items[0].values.length > 0) {
        console.log("=== ORDER ITEMS FOR ORDER 28 ===");
        const cols = items[0].columns;
        items[0].values.forEach(row => {
            const obj = {};
            cols.forEach((c, i) => obj[c] = row[i]);
            console.log(JSON.stringify(obj));
        });
    }

    // Check download_tokens for order 28
    const tokens = db.exec("SELECT * FROM download_tokens WHERE order_id = 28");
    if (tokens.length > 0 && tokens[0].values.length > 0) {
        console.log("\n=== DOWNLOAD TOKENS FOR ORDER 28 ===");
        const cols = tokens[0].columns;
        tokens[0].values.forEach(row => {
            const obj = {};
            cols.forEach((c, i) => obj[c] = row[i]);
            console.log(JSON.stringify(obj));
        });
    } else {
        console.log("\nNo download tokens for order 28");
    }

    // Check what query listForUser runs
    console.log("\n=== MANUAL QUERY (what listForUser should do) ===");
    const userOrders = db.exec("SELECT * FROM orders WHERE user_id = 58 ORDER BY created_at DESC");
    if (userOrders.length > 0 && userOrders[0].values.length > 0) {
        const cols = userOrders[0].columns;
        console.log("Found " + userOrders[0].values.length + " orders for user 58");
        console.log("Columns: " + JSON.stringify(cols));
        // Check if the data really exists
        console.log("First order data:", JSON.stringify(userOrders[0].values[0]));
    }
}

main().catch(console.error);
