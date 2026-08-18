@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "CLEAN_DATA=0"
set "ASSUME_YES=0"
set "FAILED=0"

for %%A in (%*) do (
    if /I "%%~A"=="--data" set "CLEAN_DATA=1"
    if /I "%%~A"=="--yes" set "ASSUME_YES=1"
    if /I "%%~A"=="--help" goto :usage
    if /I "%%~A"=="-h" goto :usage
)

pushd "%ROOT%" >nul || (
    echo Failed to enter project directory: "%ROOT%"
    exit /b 1
)

echo Cleaning generated files for packaging...
echo Project root: %ROOT%
echo.

if exist "%ROOT%app_dev.pid" (
    echo [FAIL] app_dev.pid exists. Stop the service and remove the stale PID file before cleaning on Windows.
    popd >nul
    exit /b 1
)

call :remove_dir "%ROOT%node_modules"
call :remove_dir "%ROOT%core\node_modules"
call :remove_dir "%ROOT%web\node_modules"
call :remove_dir "%ROOT%core\dist"
call :remove_dir "%ROOT%web\dist"
call :remove_dir "%ROOT%coverage"
call :remove_dir "%ROOT%.nyc_output"
call :remove_dir "%ROOT%core\coverage"
call :remove_dir "%ROOT%web\coverage"
call :remove_file "%ROOT%core\client.js"
call :remove_file "%ROOT%web\stats.html"
call :remove_file "%ROOT%app_dev.log"

for /r "%ROOT%" %%F in (*.tsbuildinfo) do call :remove_file "%%~fF"

if "%CLEAN_DATA%"=="1" (
    if "%ASSUME_YES%"=="1" (
        set "DELETE_DATA=Y"
    ) else (
        choice /C YN /N /M "Delete runtime data in core\data (accounts, credentials and logs)? [Y/N] "
        if errorlevel 2 set "DELETE_DATA=N"
        if errorlevel 1 set "DELETE_DATA=Y"
    )
    if /I "!DELETE_DATA!"=="Y" call :remove_dir "%ROOT%core\data"
)

popd >nul

if "%FAILED%"=="1" (
    echo.
    echo Cleaning finished with errors. Close processes using the files and retry.
    exit /b 1
)

echo.
echo Cleaning complete. Runtime data was preserved unless --data was supplied.
exit /b 0

:remove_dir
if not exist "%~1" exit /b 0
echo [DIR ] %~1
rd /s /q "%~1" >nul 2>&1
if exist "%~1" (
    echo [FAIL] Could not remove %~1
    set "FAILED=1"
) else (
    echo [ OK ] Removed directory
)
exit /b 0

:remove_file
if not exist "%~1" exit /b 0
echo [FILE] %~1
del /f /q "%~1" >nul 2>&1
if exist "%~1" (
    echo [FAIL] Could not remove %~1
    set "FAILED=1"
) else (
    echo [ OK ] Removed file
)
exit /b 0

:usage
echo Usage: clean-for-pack.bat [--data] [--yes]
echo.
echo   --data  Also remove core\data runtime data. Prompts unless --yes is used.
echo   --yes   Skip the runtime data confirmation prompt.
exit /b 0
