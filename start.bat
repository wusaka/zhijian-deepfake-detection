@echo off
setlocal
rem ZhiJian System - one-click start (Windows)
rem Requirements: Docker Desktop running, JDK 17 on PATH (or JAVA_HOME set),
rem a conda env named "m2f2" for the AI engine, Node.js 18+.
rem Override the conda env name with:  set M2F2_ENV=your_env_name

set "ROOT=%~dp0"
if "%M2F2_ENV%"=="" set "M2F2_ENV=m2f2"
if not "%JAVA_HOME%"=="" set "PATH=%JAVA_HOME%\bin;%PATH%"

echo ========================================
echo   ZhiJian System - Start Script
echo ========================================
echo.

echo [1/4] Starting Docker infrastructure...
docker-compose -f "%ROOT%Video-Detection-System-main\docker-compose-infra.yml" up -d
if %errorlevel% neq 0 (
    echo [ERROR] Docker start failed! Is Docker Desktop running?
    pause
    exit /b 1
)
echo [OK] Docker ready
echo.

echo [2/4] Starting AI Bridge (port 5000)...
set HF_HUB_OFFLINE=1
start "M2F2-Bridge-AI" cmd /k "cd /d "%ROOT%M2F2_Det-main" && conda run -n %M2F2_ENV% --live-stream python -u bridge_service.py"
echo [OK] AI Bridge loading
ping 127.0.0.1 -n 11 > nul
echo.

echo [3/4] Starting Java services (9001-9006)...
cd /d "%ROOT%Video-Detection-System-main"
for %%s in (auth-service video-service detection-service worker-service websocket-service audit-service) do (
    if exist "%%s\target\%%s-0.0.1-SNAPSHOT.jar" (
        start "%%s" /min java -jar "%%s\target\%%s-0.0.1-SNAPSHOT.jar"
        echo   %%s started
    ) else (
        echo   [WARN] %%s jar not found - run "mvn clean package -DskipTests" first
    )
)
echo.

echo [4/4] Starting frontend (port 3000)...
cd /d "%ROOT%Video-Detection-System-main\frontend"
start "Frontend" cmd /k "npx vite --port 3000 --host 127.0.0.1"
echo [OK] Frontend starting
echo.

echo ========================================
echo   All services launched!
echo   URL: http://127.0.0.1:3000
echo ========================================
echo.
echo Waiting 35s for services...
ping 127.0.0.1 -n 36 > nul
echo.
echo Checking status...
for %%p in (3000 5000 9001 9002 9003 9004 9005 9006) do (
    netstat -ano | findstr "LISTENING" | findstr ":%%p " > nul && echo   port %%p: OK || echo   port %%p: WAIT
)
echo.
pause
