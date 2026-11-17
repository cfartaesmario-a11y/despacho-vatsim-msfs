@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Arrancando Despacho VATSIM...
start "Despacho VATSIM (no cerrar)" /min node --use-system-ca server.js
timeout /t 3 /nobreak >nul
start "" "http://localhost:5757"
