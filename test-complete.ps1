# Test flux complet - session persistente
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000"

try {
    # 1. Login
    Write-Host "=== ETAPE 1: LOGIN ==="
    $ws = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $loginBody = @{ email='testflux@skytest.com'; password='test1234' } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -WebSession $ws
    Write-Host "[OK] User: $($r.user.id) $($r.user.name)"

    # 2. Vider panier
    Write-Host "`n=== ETAPE 2: VIDER PANIER ==="
    $r2 = Invoke-RestMethod -Uri "$base/api/cart" -Method DELETE -WebSession $ws
    Write-Host "[OK]"

    # 3. Ajouter carte
    Write-Host "`n=== ETAPE 3: AJOUTER CARTE ==="
    $cartBody = @{
        type="sky_map"; title="Carte Complete Test"; price=2000
        metadata=@{
            date="2026-07-15"; time="23:00"; lat=45.5017; lng=-73.5673
            location_name="Montreal Centre"; subtitle="Ete 2026"; style="dark"; orientation="vertical"
            titleFont="Cinzel"; subtitleFont="Montserrat"; titleSize=100; subtitleSize=100
            backgroundImageUrl=""; cardPreviewId="final-test-001"
        }
    } | ConvertTo-Json
    $r3 = Invoke-RestMethod -Uri "$base/api/cart/items" -Method POST -ContentType "application/json" -Body $cartBody -WebSession $ws
    Write-Host "[OK] Cart: $($r3.cart.items.Count) items, total=$($r3.cart.total)"

    # 4. Checkout
    Write-Host "`n=== ETAPE 4: CHECKOUT ==="
    $r4 = Invoke-RestMethod -Uri "$base/api/checkout" -Method POST -WebSession $ws
    $orderId = $r4.orderId
    $sessionId = $r4.sessionId
    Write-Host "[OK] OrderId=$orderId sessionId=$sessionId"
    Write-Host "[OK] Redirect URL: $($r4.url)"

    # Wait for server to process
    Start-Sleep -Seconds 2

    # 5. Status check (this triggers finalizeOrder)
    Write-Host "`n=== ETAPE 5: FINALISER ==="
    $statusUrl = "$base/api/checkout/status?order_id=$orderId"
    if ($sessionId) { $statusUrl = $statusUrl + "&session_id=" + $sessionId }
    $r5 = Invoke-RestMethod -Uri $statusUrl -Method GET -WebSession $ws
    Write-Host "[OK] Status: $($r5.status) mock=$($r5.mock)"

    # 6. Mes commandes (directement APRES finalisation)
    Write-Host "`n=== ETAPE 6: /API/ORDERS ==="
    $r6 = Invoke-RestMethod -Uri "$base/api/orders" -Method GET -WebSession $ws
    Write-Host "[OK] Orders count: $($r6.orders.Count)"
    if ($r6.orders.Count -gt 0) {
        foreach ($order in $r6.orders) {
            Write-Host "  Order #$($order.id) status=$($order.status)"
            foreach ($item in $order.items) {
                $meta = $item.metadata
                Write-Host "    - $($item.product_title)"
                Write-Host "      downloadToken: $([bool]$item.downloadToken)"
                Write-Host "      imagePath: $([bool]$meta.imagePath)"
                Write-Host "      pdfPath: $([bool]$meta.pdfPath)"
            }
        }
    } else {
        Write-Host "[PROBLEME] 0 commandes retournees mais la DB devrait avoir quelque chose!"
    }

    # 7. Telechargement
    Write-Host "`n=== ETAPE 7: TELECHARGEMENT ==="
    if ($r6.orders.Count -gt 0) {
        foreach ($order in $r6.orders) {
            foreach ($item in $order.items) {
                if ($item.downloadToken -and -not $item.tokenExpired) {
                    Write-Host "Token disponible pour: $($item.product_title)"
                    $dlUrl = "$base/api/download/$($item.downloadToken)"
                    try {
                        $dl = Invoke-WebRequest -Uri $dlUrl -Method GET -WebSession $ws -TimeoutSec 20 -PassThru -ErrorAction Stop
                        Write-Host "[OK] Telechargement REUSSI"
                        Write-Host "     Type: $($dl.Headers['Content-Type'])"
                        Write-Host "     Size: $($dl.Headers['Content-Length']) bytes"
                        Write-Host "     Disposition: $($dl.Headers['Content-Disposition'])"

                        # Save to temp file to check
                        $tmpFile = "$env:TEMP\sky_store_dl_$orderId.bin"
                        [System.IO.File]::WriteAllBytes($tmpFile, $dl.Content)
                        Write-Host "     Saved to: $tmpFile"
                        $fi = Get-Item $tmpFile
                        Write-Host "     File size: $($fi.Length) bytes"
                    } catch {
                        Write-Host "[ERREUR] $($_.Exception.Message.Substring(0, 200))"
                    }
                } else {
                    Write-Host "Pas de token pour: $($item.product_title) expired=$($item.tokenExpired)"
                }
            }
        }
    }

    Write-Host "`n=== TERMINE ==="

} catch {
    Write-Host "`n[ERREUR] $($_.Exception.Message)"
    try { Write-Host $_.ScriptStackTrace } catch {}
}
