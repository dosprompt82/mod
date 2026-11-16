@echo off
rem Starts Personal Superpower and opens it in your browser. Runs first-time setup if needed.
setlocal
cd /d "%~dp0"
if exist .env ( for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do ( if not "%%B"=="" set "%%A=%%B" ) )
if not defined PS_HOST set PS_HOST=127.0.0.1
if not defined PS_PORT set PS_PORT=8765
set URL=http://%PS_HOST%:%PS_PORT%
if not exist backend\.venv\Scripts\python.exe goto setup
if not exist frontend\dist\index.html goto setup
backend\.venv\Scripts\python.exe tools\setup_stamp.py check && goto run
echo A new version was installed: updating packages and rebuilding the interface (about a minute)...
call setup.bat || ( pause & exit /b 1 )
goto run
:setup
echo First run: setting things up (a few minutes, once)...
call setup.bat || ( pause & exit /b 1 )
:run
echo.
echo Personal Superpower is starting at %URL%
echo Your browser will open when it's ready.
echo Keep this window open while you use it. Close it to stop.
set PS_OPEN_BROWSER=1
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host %PS_HOST% --port %PS_PORT% --log-level warning
if errorlevel 1 ( echo The server stopped. If port %PS_PORT% is in use, set PS_PORT in .env. & pause )
