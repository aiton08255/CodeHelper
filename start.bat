@echo off
title Self-Evo Research Engine
echo.
echo   Starting Self-Evo...
echo.

:: Start the backend server
start "Self-Evo Server" /min cmd /c "cd /d %~dp0 && npm run start"

:: Wait for server to be ready
timeout /t 3 /nobreak >nul

:: Start the web UI
start "Self-Evo Web UI" /min cmd /c "cd /d %~dp0\web && npx vite --host 0.0.0.0"

:: Wait for vite
timeout /t 2 /nobreak >nul

echo.
echo   Self-Evo is running!
echo.
echo   Web UI:  http://localhost:5173
echo   Phone:   http://100.84.192.60:5173
echo   API:     http://localhost:13742
echo.
echo   Press any key to stop all servers...
pause >nul

:: Cleanup
taskkill /FI "WINDOWTITLE eq Self-Evo Server" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Self-Evo Web UI" /F >nul 2>&1
echo   Stopped.
