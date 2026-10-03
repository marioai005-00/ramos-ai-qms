@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo  RAMOS AI-QMS 8D - DEMO portal (data\demo.sqlite3, port 8792)
echo  Operational data (data\qms.sqlite3) is not used. Mail is off.
echo ========================================================
python "%~dp0demo_server.py"
exit /b 0
