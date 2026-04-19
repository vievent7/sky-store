$ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email='testflux@skytest.com'; password='test1234' } | ConvertTo-Json
$r = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method POST -ContentType 'application/json' -Body $loginBody -WebSession $ws
Write-Host "Login: $($r.user.id)"

Start-Sleep 1

$r2 = Invoke-RestMethod -Uri 'http://localhost:3000/api/orders' -Method GET -WebSession $ws
Write-Host "Orders: $($r2.orders.Count)"
$json = $r2 | ConvertTo-Json -Depth 10
Write-Host $json
