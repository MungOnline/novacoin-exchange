@echo off
title NovaCoin - หยุดระบบ
cd /d "%~dp0"

echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║        หยุดการทำงาน NovaCoin Exchange        ║
echo   ╚══════════════════════════════════════════════╝
echo.

:: Kill backend and frontend servers
echo   [*] กำลังปิดเซิร์ฟเวอร์ทั้งหมด...

taskkill /f /fi "WINDOWTITLE eq NovaCoin*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq node*" >nul 2>&1

:: Kill any remaining node processes related to our project
for /f "tokens=2 delims=," %%a in ('tasklist /fi "imagename eq node.exe" /fo csv /nh 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Also kill processes on port 3000 and 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 "') do taskkill /f /pid %%a >nul 2>&1

echo   [✓] ปิดระบบเรียบร้อย
echo.
timeout /t 2 /nobreak >nul
