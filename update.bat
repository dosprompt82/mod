@echo off
rem Updates Personal Superpower to the newest version. Your data folder is never touched; it is backed up first.
setlocal
cd /d "%~dp0"
if exist .env ( for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do ( if not "%%B"=="" set "%%A=%%B" ) )
if not defined PS_PORT set PS_PORT=8765
set PYBIN=backend\.venv\Scripts\python.exe
if exist %PYBIN% (
  %PYBIN% -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:%PS_PORT%/api/health', timeout=1)" >nul 2>&1 && (
    echo Personal Superpower is running. Close its window first, then run this again.
    pause & exit /b 1 )
)
if not defined PS_DATA_DIR set PS_DATA_DIR=%~dp0data
if exist "%PS_DATA_DIR%\superpower.db" if exist %PYBIN% (
  echo 1/3  Backing up your data...
  pushd backend
  .venv\Scripts\python.exe -c "from app.services.backup import create_backup; print('     Saved', create_backup('pre-update'))"
  popd
) else ( echo 1/3  No existing data to back up. )
echo 2/3  Downloading the newest version...
if not exist .git ( echo This folder wasn't installed with Git. Follow "Updating a ZIP download" in UPDATING.md. & pause & exit /b 1 )
where git >nul 2>&1 || ( echo Git is not installed. Use GitHub Desktop or the ZIP steps in UPDATING.md. & pause & exit /b 1 )
git pull --ff-only || ( echo Couldn't download the update. See "If the update fails" in UPDATING.md. & pause & exit /b 1 )
echo 3/3  Installing and rebuilding...
call setup.bat || ( pause & exit /b 1 )
echo Done. Start the app as usual.
pause
