$ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email='testflux@skytest.com'; password='test1234' } | ConvertTo-Json
$r = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/login' -Method POST -ContentType 'application/json' -Body $loginBody -WebSession $ws
Write-Host "Login OK: $($r.user.id)"
Start-Sleep 1
$r2 = Invoke-RestMethod -Uri 'http://localhost:3000/api/orders' -Method GET -WebSession $ws
Write-Host "Orders count: $($r2.orders.Count)"
if ($r2.orders.Count -gt 0) {
    $r2.orders | ConvertTo-Json -Depth 3 | Write-Host
} else {
    Write-Host "0 orders - checking if session is preserved"
    $r3 = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/me' -Method GET -WebSession $ws
    Write-Host "Auth/me still returns: $($r3.user.id)"
}
