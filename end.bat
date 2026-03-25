@echo off
echo.
echo   Stopping Self-Evo...
taskkill /FI "WINDOWTITLE eq Self-Evo*" /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":13742 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
echo   Stopped.
echo.
