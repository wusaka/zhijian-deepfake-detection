@echo off
setlocal
rem ZhiJian System - stop script (only closes the windows started by start.bat)
set "ROOT=%~dp0"

echo ========================================
echo   ZhiJian System - Stop Script
echo ========================================
echo.

echo [1/2] Closing service windows...
for %%t in ("M2F2-Bridge-AI" "auth-service" "video-service" "detection-service" "worker-service" "websocket-service" "audit-service" "Frontend") do (
    taskkill /fi "WINDOWTITLE eq %%~t*" /t /f > nul 2>&1 && echo   %%~t stopped
)
echo.

echo [2/2] Stopping Docker infrastructure...
docker-compose -f "%ROOT%Video-Detection-System-main\docker-compose-infra.yml" stop
echo.

echo ========================================
echo   All services stopped.
echo ========================================
pause
