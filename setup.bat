@echo off
rem First-time setup for Personal Superpower (Windows). Safe to re-run.
setlocal
cd /d "%~dp0"
set PY=
for %%V in (3.13 3.12) do (
  if not defined PY ( py -%%V -c "import sys" >nul 2>&1 && set PY=py -%%V )
)
if not defined PY ( python -c "import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)" >nul 2>&1 && set PY=python )
if not defined PY ( echo Python 3.12 or newer is required: https://www.python.org/downloads/ & exit /b 1 )
where node >nul 2>&1 || ( echo Node.js 18 or newer is required: https://nodejs.org/ & exit /b 1 )

echo 1/3  Python environment
if not exist backend\.venv\Scripts\python.exe ( %PY% -m venv backend\.venv || exit /b 1 )
backend\.venv\Scripts\python.exe -m pip install --quiet --upgrade pip
backend\.venv\Scripts\python.exe -m pip install --quiet -r backend\requirements.txt || exit /b 1

echo 2/3  Interface dependencies
pushd frontend
call npm ci --no-audit --no-fund --loglevel=error || ( popd & exit /b 1 )
echo 3/3  Building the interface
call npm run build --silent || ( popd & exit /b 1 )
popd
backend\.venv\Scripts\python.exe tools\setup_stamp.py write
echo Setup complete. Start the app with start.bat
