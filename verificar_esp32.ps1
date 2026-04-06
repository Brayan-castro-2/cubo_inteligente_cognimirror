# ESP32 Serial Monitor - PowerShell
# Script para verificar y comunicarse con la ESP32

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   ESP32 Serial Monitor - Verificador  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar puertos COM disponibles
Write-Host "[1] Buscando puertos COM disponibles..." -ForegroundColor Yellow
Write-Host ""

$ports = [System.IO.Ports.SerialPort]::GetPortNames()

if ($ports.Count -eq 0) {
    Write-Host "   ❌ No se encontraron puertos COM" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Esto puede significar:" -ForegroundColor Yellow
    Write-Host "   - El driver CP210x no está instalado" -ForegroundColor White
    Write-Host "   - La ESP32 no está conectada" -ForegroundColor White
    Write-Host "   - El cable USB no soporta datos" -ForegroundColor White
    Write-Host ""
    Write-Host "   SOLUCION: Instala el driver desde:" -ForegroundColor Green
    Write-Host "   https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers" -ForegroundColor Blue
    Write-Host ""
    
    # Intentar abrir la página de descarga
    $respuesta = Read-Host "   ¿Quieres abrir la página de descarga del driver? (s/n)"
    if ($respuesta -eq 's' -or $respuesta -eq 'S') {
        Start-Process "https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers"
    }
} else {
    Write-Host "   ✅ Puertos COM encontrados:" -ForegroundColor Green
    foreach ($port in $ports) {
        Write-Host "      - $port" -ForegroundColor White
    }
    Write-Host ""
    
    # Preguntar qué puerto usar
    $selectedPort = Read-Host "   Ingresa el puerto COM (ej: COM3)"
    
    if ($selectedPort -and $ports -contains $selectedPort.ToUpper()) {
        Write-Host ""
        Write-Host "[2] Conectando a $selectedPort..." -ForegroundColor Yellow
        
        try {
            $serialPort = New-Object System.IO.Ports.SerialPort
            $serialPort.PortName = $selectedPort.ToUpper()
            $serialPort.BaudRate = 115200
            $serialPort.Parity = [System.IO.Ports.Parity]::None
            $serialPort.DataBits = 8
            $serialPort.StopBits = [System.IO.Ports.StopBits]::One
            $serialPort.ReadTimeout = 1000
            
            $serialPort.Open()
            
            Write-Host "   ✅ Conectado exitosamente a $selectedPort @ 115200 baud" -ForegroundColor Green
            Write-Host ""
            Write-Host "   Leyendo datos... (Presiona Ctrl+C para salir)" -ForegroundColor Cyan
            Write-Host "   ========================================" -ForegroundColor Gray
            
            while ($true) {
                try {
                    $data = $serialPort.ReadLine()
                    $timestamp = Get-Date -Format "HH:mm:ss"
                    Write-Host "   [$timestamp] $data" -ForegroundColor Green
                } catch [System.TimeoutException] {
                    # Timeout es normal, continuar
                } catch {
                    Write-Host "   Error: $_" -ForegroundColor Red
                }
            }
        } catch {
            Write-Host "   ❌ Error al conectar: $_" -ForegroundColor Red
        } finally {
            if ($serialPort -and $serialPort.IsOpen) {
                $serialPort.Close()
                Write-Host ""
                Write-Host "   Puerto cerrado." -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "   ❌ Puerto no válido o no encontrado" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Presiona Enter para salir..."
Read-Host
