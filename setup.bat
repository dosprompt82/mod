@echo off
rem First-time setup for Personal Superpower (Windows). Safe to re-run.
setlocal
cd /d "%~dp0"

rem Find Python 3.12+ (prefer 3.13 / 3.12, which every dependency supports).
set "PY="
for %%V in (3.13 3.12) do (
  if not defined PY ( py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V" )
)
if not defined PY ( py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)" >nul 2>&1 && set "PY=py -3" )
if not defined PY ( python -c "import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)" >nul 2>&1 && set "PY=python" )
if not defined PY (
  echo Python 3.12 or newer is required. Install it from https://www.python.org/downloads/
  echo During installation, tick "Add python.exe to PATH". Then run this again.
  exit /b 1
)
where node >nul 2>&1 || ( echo Node.js 18 or newer is required: https://nodejs.org/ ^(choose LTS^). Then run this again. & exit /b 1 )

echo.
echo 1/3  Python environment
if not exist backend\.venv\Scripts\python.exe ( %PY% -m venv backend\.venv || exit /b 1 )
echo      Downloading and installing Python packages (about 100 MB; this can take a few minutes)...
backend\.venv\Scripts\python.exe -m pip install --quiet --disable-pip-version-check --upgrade pip
backend\.venv\Scripts\python.exe -m pip install --disable-pip-version-check --progress-bar on -r backend\requirements.txt || (
  echo.
  echo Installing Python packages failed. If the messages above mention "Microsoft Visual C++", "Rust" or "building wheel",
  echo your Python version is too new for one of the packages: install Python 3.13 from python.org and run this again.
  exit /b 1
)

echo.
echo 2/3  Interface dependencies (about 1 minute)...
pushd frontend
call npm ci --no-audit --no-fund --loglevel=error || ( popd & exit /b 1 )
echo.
echo 3/3  Building the interface...
call npm run build > "%TEMP%\ps-build.log" 2>&1 || ( type "%TEMP%\ps-build.log" & echo The interface could not be built ^(details above^). & popd & exit /b 1 )
popd
backend\.venv\Scripts\python.exe tools\setup_stamp.py write
echo.
echo Setup complete.
