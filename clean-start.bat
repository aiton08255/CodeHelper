@echo off
title Self-Evo Clean Start
echo.
echo   Self-Evo Research Engine — Clean Start
echo   =======================================
echo.

:: Kill any existing Self-Evo processes
echo   Cleaning up old processes...
taskkill /FI "WINDOWTITLE eq Self-Evo*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq npm*" /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":13742 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak >nul

:: Start backend server
echo   Starting backend on port 13742...
start "Self-Evo Server" /min cmd /c "cd /d %~dp0 && npm run start 2>&1"
timeout /t 4 /nobreak >nul

:: Verify backend is up
curl -s http://127.0.0.1:13742/api/health >nul 2>&1
if %errorlevel% neq 0 (
    echo   [!] Backend failed to start. Check for errors.
    pause
    exit /b 1
)
echo   Backend: OK

:: Start web UI
echo   Starting web UI on port 5173...
start "Self-Evo Web UI" /min cmd /c "cd /d %~dp0\web && npx vite --host 0.0.0.0 2>&1"
timeout /t 3 /nobreak >nul
echo   Web UI:  OK
echo.
echo   =========================================
echo   Self-Evo is running!
echo.
echo   PC:      http://localhost:5173
echo   Phone:   http://100.84.192.60:5173
echo   API:     http://localhost:13742/api/health
echo   =========================================
echo.
echo   Close this window or run end.bat to stop.
echo.
