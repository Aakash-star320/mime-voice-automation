@echo off
echo Starting Mime Voice Automation...
echo.
start "Express Server" cmd /k "cd backend\express && node server.js"
timeout /t 2 /nobreak > nul
start "FastAPI Server" cmd /k "cd backend\fastapi && python mimeServer.py"
echo.
echo ✅ Servers started!
echo - Express: http://localhost:8000
echo - FastAPI: http://localhost:8001
echo.
echo Press any key to stop servers...
pause > nul
