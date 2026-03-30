# Servidor HTTP Local para ESP32 Monitor
# Puerto: 8080

$Puerto = 8080
$Directorio = $PSScriptRoot

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ESP32 Monitor - Servidor de Desarrollo  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Directorio: $Directorio" -ForegroundColor Gray
Write-Host "  Puerto: $Puerto" -ForegroundColor Gray
Write-Host ""
Write-Host "  Abre en tu navegador:" -ForegroundColor Yellow
Write-Host "  http://localhost:$Puerto/esp32_serial_monitor.html" -ForegroundColor Green
Write-Host ""
Write-Host "  Presiona Ctrl+C para detener el servidor" -ForegroundColor DarkGray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Crear el listener HTTP
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Puerto/")
$listener.Prefixes.Add("http://127.0.0.1:$Puerto/")

try {
    $listener.Start()
    Write-Host "[OK] Servidor iniciado en puerto $Puerto" -ForegroundColor Green
    Write-Host ""
    
    # Abrir automaticamente en el navegador
    Start-Process "http://localhost:$Puerto/esp32_serial_monitor.html"
    
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # Obtener la ruta solicitada
        $rutaSolicitada = $request.Url.LocalPath
        if ($rutaSolicitada -eq "/") {
            $rutaSolicitada = "/esp32_serial_monitor.html"
        }
        
        $archivoPath = Join-Path $Directorio $rutaSolicitada.TrimStart("/")
        
        # Log de la peticion
        $timestamp = Get-Date -Format "HH:mm:ss"
        Write-Host "[$timestamp] $($request.HttpMethod) $rutaSolicitada" -ForegroundColor White
        
        if (Test-Path $archivoPath -PathType Leaf) {
            # Determinar el tipo MIME
            $extension = [System.IO.Path]::GetExtension($archivoPath).ToLower()
            $contentType = switch ($extension) {
                ".html" { "text/html; charset=utf-8" }
                ".css" { "text/css; charset=utf-8" }
                ".js" { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png" { "image/png" }
                ".jpg" { "image/jpeg" }
                ".gif" { "image/gif" }
                ".svg" { "image/svg+xml" }
                ".ico" { "image/x-icon" }
                ".woff" { "font/woff" }
                ".woff2" { "font/woff2" }
                default { "application/octet-stream" }
            }
            
            # Leer y enviar el archivo
            $contenido = [System.IO.File]::ReadAllBytes($archivoPath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $contenido.Length
            $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.OutputStream.Write($contenido, 0, $contenido.Length)
            
            Write-Host "         -> 200 OK ($contentType)" -ForegroundColor Green
        }
        else {
            # Archivo no encontrado
            $response.StatusCode = 404
            $mensajeError = "<html><body><h1>404 - Archivo no encontrado</h1><p>$rutaSolicitada</p></body></html>"
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($mensajeError)
            $response.ContentType = "text/html; charset=utf-8"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            
            Write-Host "         -> 404 Not Found" -ForegroundColor Red
        }
        
        $response.Close()
    }
}
catch {
    Write-Host "[ERROR] $_" -ForegroundColor Red
}
finally {
    $listener.Stop()
    Write-Host ""
    Write-Host "[INFO] Servidor detenido" -ForegroundColor Yellow
}
