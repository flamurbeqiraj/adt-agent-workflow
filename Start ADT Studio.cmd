@echo off
cd /d "%~dp0"
if not exist "node_modules\playwright" (
  call npm install
  if errorlevel 1 goto failed
)
echo Open http://127.0.0.1:8892 in your browser.
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo ADT Studio could not start. Check the message above.
pause
exit /b 1
