@echo off
REM ClawNet Quick Start Script for Windows

echo.
echo ================================
echo   ClawNet - Agent Mesh Platform
echo ================================
echo.

REM Parse arguments
set ACTION=%1
if "%ACTION%"=="" set ACTION=start

if "%ACTION%"=="start" goto start
if "%ACTION%"=="stop" goto stop
if "%ACTION%"=="restart" goto restart
if "%ACTION%"=="logs" goto logs
if "%ACTION%"=="status" goto status
if "%ACTION%"=="build" goto build
if "%ACTION%"=="clean" goto clean
if "%ACTION%"=="dev" goto dev
goto usage

:start
echo Starting ClawNet...
if not exist .env copy .env.example .env
docker-compose up -d
echo.
echo ✅ ClawNet is running!
echo.
echo Endpoints:
echo   - API:          http://localhost:4000
echo   - WebSocket:    ws://localhost:4000/ws
echo   - Health:       http://localhost:4000/health
echo   - Stats:        http://localhost:4000/api/v1/stats
echo.
goto end

:stop
echo Stopping ClawNet...
docker-compose down
echo ✅ ClawNet stopped
goto end

:restart
echo Restarting ClawNet...
docker-compose restart
echo ✅ ClawNet restarted
goto end

:logs
docker-compose logs -f api
goto end

:status
echo ClawNet Status:
docker-compose ps
echo.
echo Health Check:
curl -s http://localhost:4000/health
echo.
goto end

:build
echo Building ClawNet...
docker-compose build
echo ✅ Build complete
goto end

:clean
echo Cleaning up...
docker-compose down -v
echo ✅ Cleanup complete
goto end

:dev
echo Starting in development mode...
where pnpm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: pnpm is not installed
    echo Install pnpm: npm install -g pnpm
    exit /b 1
)
docker ps | findstr redis >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Starting Redis...
    docker run -d -p 6379:6379 --name clawnet-redis redis:alpine
)
echo Installing dependencies...
pnpm install
echo Building packages...
pnpm build
echo Starting API server...
pnpm --filter @clawnet/api dev
goto end

:usage
echo Usage: start.bat [command]
echo.
echo Commands:
echo   start     Start ClawNet (default)
echo   stop      Stop ClawNet
echo   restart   Restart ClawNet
echo   logs      View API logs
echo   status    Check status
echo   build     Build Docker images
echo   clean     Remove all containers and volumes
echo   dev       Run in development mode (without Docker)
goto end

:end