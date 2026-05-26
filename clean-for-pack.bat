@echo off
echo ========================================
echo  Clean for packaging
echo ========================================
echo.

echo [1/3] Removing node_modules ...
if exist "%~dp0node_modules" (
    rd /s /q "%~dp0node_modules"
    echo   [OK] node_modules
)
if exist "%~dp0core\node_modules" (
    rd /s /q "%~dp0core\node_modules"
    echo   [OK] core\node_modules
)
if exist "%~dp0web\node_modules" (
    rd /s /q "%~dp0web\node_modules"
    echo   [OK] web\node_modules
)

echo.
echo [2/3] Removing build output ...
if exist "%~dp0web\dist" (
    rd /s /q "%~dp0web\dist"
    echo   [OK] web\dist
)
if exist "%~dp0web\stats.html" (
    del /q "%~dp0web\stats.html"
    echo   [OK] web\stats.html
)

echo.
echo [3/3] Removing runtime data ...
if exist "%~dp0core\data" (
    rd /s /q "%~dp0core\data"
    echo   [OK] core\data
)

echo.
echo ========================================
echo  Done!
echo ========================================
echo.
pause
