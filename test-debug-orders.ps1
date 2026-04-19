$ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email='testflux@skytest.com'; password='test1234' } | ConvertTo-Json
$r = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method POST -ContentType 'application/json' -Body $loginBody -WebSession $ws
Write-Host "Login OK: $($r.user.id)"

Start-Sleep 1

# Check orders with verbose output
$r2 = Invoke-RestMethod -Uri 'http://localhost:3000/api/orders' -Method GET -WebSession $ws
Write-Host "Orders count: $($r2.orders.Count)"
$json = $r2 | ConvertTo-Json -Depth 10
Write-Host "Full response:"
Write-Host $json

# Also check download_tokens for order 29
$nodeJs = @"
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
(async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(path.join(__dirname, 'data', 'sky-store.db')));
    const tokens = db.exec("SELECT token, order_id, order_item_id, expires_at FROM download_tokens WHERE order_id IN (28,29)");
    if (tokens[0]) tokens[0].values.forEach(r => console.log(JSON.stringify(r)));
    else console.log('No tokens for 28,29');
    const items = db.exec("SELECT id, order_id, product_type FROM order_items WHERE order_id IN (28,29)");
    if (items[0]) items[0].values.forEach(r => console.log('item: ' + JSON.stringify(r)));
    else console.log('No items for 28,29');
})();
"@
$nodeJs | Out-File -FilePath "$env:TEMP\check_tokens.js" -Encoding UTF8
node "$env:TEMP\check_tokens.js"
