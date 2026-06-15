# NovaCoin Exchange - One-Click Starter
# ระบบซื้อขายเหรียญดิจิทัล

$ErrorActionPreference = "SilentlyContinue"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║      NovaCoin Exchange - Startup             ║" -ForegroundColor Green
Write-Host "║      ระบบซื้อขายเหรียญดิจิทัล                  ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "[✓] Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] กรุณาติดตั้ง Node.js ก่อน!" -ForegroundColor Red
    Write-Host "        ดาวน์โหลดที่: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "กด Enter เพื่อปิด"
    exit
}

# Function to check if a port is in use
function Test-PortInUse($port) {
    $connections = netstat -ano | Select-String ":$port "
    return ($connections -ne $null)
}

# Kill existing processes on our ports
if (Test-PortInUse 3000) {
    Write-Host "[!] Port 3000 ถูกใช้อยู่ กำลังปิด..." -ForegroundColor Yellow
    $process = netstat -ano | Select-String ":3000 " | ForEach-Object { $_ -split '\s+' | Select-Object -Last 1 }
    if ($process) { Stop-Process -Id $process -Force -ErrorAction SilentlyContinue }
}
if (Test-PortInUse 5000) {
    Write-Host "[!] Port 5000 ถูกใช้อยู่ กำลังปิด..." -ForegroundColor Yellow
    $process = netstat -ano | Select-String ":5000 " | ForEach-Object { $_ -split '\s+' | Select-Object -Last 1 }
    if ($process) { Stop-Process -Id $process -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 1

# Backend setup
Write-Host ""
Write-Host "[1/4] กำลังติดตั้ง Backend dependencies..." -ForegroundColor Cyan
Set-Location "$rootDir\backend"
if (-not (Test-Path "node_modules")) {
    npm install --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] ติดตั้ง Backend ไม่สำเร็จ!" -ForegroundColor Red
        Read-Host "กด Enter เพื่อปิด"
        exit
    }
}
Write-Host "[✓] Backend dependencies พร้อมแล้ว" -ForegroundColor Green

# Seed database
Write-Host "[2/4] กำลังเตรียมฐานข้อมูล..." -ForegroundColor Cyan
if (-not (Test-Path "data\novacoin.db")) {
    node src/seed.js
    Write-Host "[✓] สร้างฐานข้อมูลและ Admin เรียบร้อย" -ForegroundColor Green
} else {
    $userCount = node -e "const {prepare,initializeDatabase}=require('./src/database');(async()=>{await initializeDatabase();const u=prepare('SELECT COUNT(*) as c FROM users').get().c;console.log(u)})()" 2>$null
    Write-Host "[✓] ฐานข้อมูลพร้อมแล้ว (ผู้ใช้: $userCount คน)" -ForegroundColor Green
}

# Frontend setup
Write-Host "[3/4] กำลังติดตั้ง Frontend dependencies..." -ForegroundColor Cyan
Set-Location "$rootDir\frontend"
if (-not (Test-Path "node_modules")) {
    npm install --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] ติดตั้ง Frontend ไม่สำเร็จ!" -ForegroundColor Red
        Read-Host "กด Enter เพื่อปิด"
        exit
    }
}
Write-Host "[✓] Frontend dependencies พร้อมแล้ว" -ForegroundColor Green

# Start servers
Write-Host "[4/4] กำลังเริ่มระบบ..." -ForegroundColor Cyan
Set-Location $rootDir

# Start Backend
$backendJob = Start-Job -Name "NovaCoin-Backend" -ScriptBlock {
    param($dir)
    Set-Location $dir
    node src/index.js
} -ArgumentList "$rootDir\backend"

# Wait for backend
Start-Sleep -Seconds 2
$backendStatus = $null
for ($i = 0; $i -lt 10; $i++) {
    try {
        $backendStatus = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -ErrorAction Stop
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}

if ($backendStatus -and $backendStatus.status -eq "ok") {
    Write-Host "[✓] Backend API Server: http://localhost:5000" -ForegroundColor Green
} else {
    Write-Host "[!] Backend กำลังเริ่มต้น..." -ForegroundColor Yellow
}

# Start Frontend
$frontendJob = Start-Job -Name "NovaCoin-Frontend" -ScriptBlock {
    param($dir)
    Set-Location $dir
    npx next dev -p 3000
} -ArgumentList "$rootDir\frontend"

# Wait for frontend
Start-Sleep -Seconds 5
$frontendReady = $false
for ($i = 0; $i -lt 15; $i++) {
    try {
        $req = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -ErrorAction Stop
        if ($req.StatusCode -eq 200) {
            $frontendReady = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if ($frontendReady) {
    Write-Host "[✓] Frontend Web Server: http://localhost:3000" -ForegroundColor Green
} else {
    Write-Host "[!] Frontend กำลังเริ่มต้น..." -ForegroundColor Yellow
}

# Open browser
Start-Process "http://localhost:3000"

# Show info
Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║      NovaCoin Exchange พร้อมใช้งาน!           ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Frontend: http://localhost:3000              ║" -ForegroundColor White
Write-Host "║  Backend:  http://localhost:5000/api/health   ║" -ForegroundColor White
Write-Host "╠══════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  🔑 Admin Login:                             ║" -ForegroundColor Yellow
Write-Host "║     Email:    admin@novacoin.io               ║" -ForegroundColor Yellow
Write-Host "║     Password: Admin@123456                    ║" -ForegroundColor Yellow
Write-Host "╠══════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  กด Ctrl+C เพื่อปิดระบบทั้งหมด                  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Monitor jobs - keep script running and show status
try {
    while ($true) {
        $backendRunning = (Get-Job -Name "NovaCoin-Backend" -ErrorAction SilentlyContinue).State -eq "Running"
        $frontendRunning = (Get-Job -Name "NovaCoin-Frontend" -ErrorAction SilentlyContinue).State -eq "Running"
        
        if (-not $backendRunning -or -not $frontendRunning) {
            Write-Host ""
            Write-Host "[!] ระบบปิดตัวลงโดยไม่คาดคิด!" -ForegroundColor Red
            if (-not $backendRunning) { Write-Host "    - Backend Server หยุดทำงาน" -ForegroundColor Red }
            if (-not $frontendRunning) { Write-Host "    - Frontend Server หยุดทำงาน" -ForegroundColor Red }
            break
        }
        
        Start-Sleep -Seconds 5
    }
} finally {
    # Cleanup on exit
    Write-Host ""
    Write-Host "กำลังปิดระบบ..." -ForegroundColor Cyan
    Get-Job -Name "NovaCoin-Backend" -ErrorAction SilentlyContinue | Stop-Job | Remove-Job
    Get-Job -Name "NovaCoin-Frontend" -ErrorAction SilentlyContinue | Stop-Job | Remove-Job
    
    # Kill node processes
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $pid } | Stop-Process -Force -ErrorAction SilentlyContinue
    
    Write-Host "[✓] ปิดระบบเรียบร้อย" -ForegroundColor Green
    Read-Host "กด Enter เพื่อปิด"
}
