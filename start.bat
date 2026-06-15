@echo off
title NovaCoin Exchange - ระบบซื้อขายเหรียญดิจิทัล
cd /d "%~dp0"
set ROOT=%~dp0

mode con: cols=80 lines=35
color 0A

echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║        NovaCoin Exchange v1.0                ║
echo   ║        ระบบซื้อขายเหรียญดิจิทัล                ║
echo   ╚══════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [!] ERROR: กรุณาติดตั้ง Node.js ก่อน!
    echo       ดาวน์โหลดที่: https://nodejs.org/
    echo.
    pause
    exit /b
)

for /f "delims=" %%i in ('node -v') do set NODE_VER=%%i
echo   [*] Node.js %NODE_VER%

:: Cleanup old processes
echo   [*] ตรวจสอบพอร์ตที่ใช้งาน...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 "') do (
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000 "') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ============ BACKEND ============
echo.
echo   ==============================================
echo     STEP 1/4 : กำลังติดตั้ง Backend...
echo   ==============================================
cd /d "%ROOT%backend"

if not exist "node_modules" (
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo   [!] ERROR: ติดตั้ง Backend ไม่สำเร็จ!
        pause
        exit /b
    )
)

if not exist "data\novacoin.db" (
    echo.
    node src/seed.js
)

echo   [✓] Backend พร้อมแล้ว

:: ============ FRONTEND ============
echo.
echo   ==============================================
echo     STEP 2/4 : กำลังติดตั้ง Frontend...
echo   ==============================================
cd /d "%ROOT%frontend"

if not exist "node_modules" (
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo   [!] ERROR: ติดตั้ง Frontend ไม่สำเร็จ!
        pause
        exit /b
    )
)

echo   [✓] Frontend พร้อมแล้ว

:: ============ START SERVERS ============
echo.
echo   ==============================================
echo     STEP 3/4 : กำลังเริ่มระบบ...
echo   ==============================================
cd /d "%ROOT%"

:: Start Backend
start "NovaCoin Backend" cmd /c "title NovaCoin API && cd /d "%ROOT%backend" && node src/index.js"

timeout /t 3 /nobreak >nul

:: Start Frontend
start "NovaCoin Frontend" cmd /c "title NovaCoin Web && cd /d "%ROOT%frontend" && npx next dev -p 3000"

timeout /t 6 /nobreak >nul

:: ============ DONE ============
echo.
echo   ==============================================
echo     STEP 4/4 : เปิดเว็บเบราว์เซอร์...
echo   ==============================================

start http://localhost:3000

echo.
color 0E
echo.
echo   ╔══════════════════════════════════════════════╗
echo   ║     NovaCoin Exchange พร้อมใช้งาน!            ║
echo   ╠══════════════════════════════════════════════╣
echo   ║                                              ║
echo   ║   🌐  เว็บไซต์:                               ║
echo   ║       http://localhost:3000                   ║
echo   ║                                              ║
echo   ║   ⚙️  API Server:                             ║
echo   ║       http://localhost:5000/api/health        ║
echo   ║                                              ║
echo   ║   🔑  บัญชี Admin:                            ║
echo   ║       อีเมล:    admin@novacoin.io             ║
echo   ║       รหัสผ่าน: Admin@123456                  ║
echo   ║                                              ║
echo   ╠══════════════════════════════════════════════╣
echo   ║   💡  วิธีปิดระบบ:                            ║
echo   ║       ปิดหน้าต่าง Terminal ที่เปิดอยู่ทั้งหมด   ║
echo   ╚══════════════════════════════════════════════╝
echo.
echo   กดปุ่มใดก็ได้เพื่อปิดหน้าต่างนี้...
pause >nul

:: Ask if user wants to shut down servers
echo.
echo   ต้องการปิดเซิร์ฟเวอร์ทั้งหมดหรือไม่? (Y/N)
choice /c YN /n /m "   "
if errorlevel 2 goto :eof

echo   กำลังปิดเซิร์ฟเวอร์...
taskkill /f /fi "WINDOWTITLE eq NovaCoin*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq node*" >nul 2>&1
echo   [✓] ปิดระบบเรียบร้อย
timeout /t 2 /nobreak >nul
