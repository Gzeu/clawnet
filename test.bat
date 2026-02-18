@echo off
REM ClawNet Test Runner for Windows

echo.
echo ================================
echo   ClawNet Integration Test
echo ================================
echo.

REM Check if ClawNet is running
echo Checking if ClawNet is running...
curl -s http://localhost:4000/health >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] ClawNet is not running. Starting...
    echo.
    call start.bat start
    timeout /t 5 >nul
)

echo.
echo Running tests...
echo.

node test-integration.js

pause