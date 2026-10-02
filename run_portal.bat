@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo  RAMOS AI-QMS 8D Commander - Portal Launcher (Live Update)
echo ========================================================

:: Reuse this project's server or select the first free port in 8765-8775.
:: Never terminate another application that happens to use the preferred port.
echo [INFO] Starting RAMOS AI-QMS portal on the first available port (8765-8775)...
python "%~dp0portal_server.py"

echo [OK] Latest AI-QMS 8D Portal is now running with zero caching.
exit /b 0
