$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000"

$ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Login
$loginBody = @{ email='testflux@skytest.com'; password='test1234' } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -WebSession $ws
Write-Host "Login OK: $($r.user.id)"

Start-Sleep 1

# Get orders
$r2 = Invoke-RestMethod -Uri "$base/api/orders" -Method GET -WebSession $ws
Write-Host "Orders: $($r2.orders.Count)"

$order30 = $r2.orders | Where-Object { $_.id -eq 30 }
if ($order30) {
    Write-Host "Order 30 status: $($order30.status)"
    foreach ($item in $order30.items) {
        Write-Host "Item: $($item.product_title)"
        Write-Host "  downloadToken: $($item.downloadToken)"
        Write-Host "  imagePath: $($item.metadata.imagePath)"
        Write-Host "  pdfPath: $($item.metadata.pdfPath)"

        if ($item.downloadToken) {
            $dlUrl = "$base/api/download/$($item.downloadToken)"
            Write-Host "Download URL: $dlUrl"

            try {
                $outFile = "$env:TEMP\sky_download_test.png"
                $dl = Invoke-WebRequest -Uri $dlUrl -Method GET -WebSession $ws -OutFile $outFile -TimeoutSec 20 -ErrorAction Stop
                Write-Host "[OK] Download reussi!"
                $fi = Get-Item $outFile
                Write-Host "  File size: $($fi.Length) bytes"
                Write-Host "  File type: PNG (should be image)"
            } catch {
                Write-Host "[ERREUR] $($_.Exception.Message.Substring(0, 200))"
            }
        }
    }
} else {
    Write-Host "Order 30 not found in list!"
}
