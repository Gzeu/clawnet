@echo off
REM ClawNet CLI for Windows
REM Uses redis-cli directly via Docker

set REDIS_CONTAINER=clawnet-redis

if "%1"=="" goto help
if "%1"=="help" goto help
if "%1"=="ping" goto ping
if "%1"=="stats" goto stats
if "%1"=="agent" goto agent
if "%1"=="memory" goto memory
if "%1"=="message" goto message
if "%1"=="clear" goto clear
goto help

:help
echo.
echo ClawNet CLI - Agent Mesh Management
echo.
echo Usage:
echo   clawnet ping                     Test Redis connection
echo   clawnet stats                     Show mesh statistics
echo   clawnet agent list                List all agents
echo   clawnet agent find ^<skill^>       Find agents by skill
echo   clawnet memory get ^<key^>         Get memory entry
echo   clawnet message list [count]      List recent messages
echo   clawnet clear                     Clear all data
echo.
goto end

:ping
docker exec %REDIS_CONTAINER% redis-cli ping
goto end

:stats
echo.
echo === ClawNet Stats ===
echo.
echo Agents: 
docker exec %REDIS_CONTAINER% redis-cli scard clawnet:agents
echo Messages:
docker exec %REDIS_CONTAINER% redis-cli xlen clawnet:messages
echo.
goto end

:agent
if "%2"=="list" (
    echo.
    echo === Registered Agents ===
    docker exec %REDIS_CONTAINER% redis-cli smembers clawnet:agents
    goto end
)
if "%2"=="find" (
    echo.
    echo === Agents with skill: %3 ===
    docker exec %REDIS_CONTAINER% redis-cli smembers clawnet:skill:%3
    goto end
)
echo Usage: clawnet agent list^|find
goto end

:memory
if "%2"=="get" (
    echo.
    echo === Memory: %3 ===
    docker exec %REDIS_CONTAINER% redis-cli get clawnet:memory:%3
    goto end
)
echo Usage: clawnet memory get ^<key^>
goto end

:message
if "%2"=="list" (
    echo.
    echo === Recent Messages ===
    docker exec %REDIS_CONTAINER% redis-cli xrange clawnet:messages - + %3
    goto end
)
echo Usage: clawnet message list [count]
goto end

:clear
echo Clearing all ClawNet data...
docker exec %REDIS_CONTAINER% redis-cli eval "return redis.call('del', unpack(redis.call('keys', 'clawnet:*')))" 0
echo Done.
goto end

:end