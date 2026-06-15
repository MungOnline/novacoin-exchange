# 🚀 NovaCoin Exchange — คู่มือ Deploy ฟรี 24/7

## 📦 โครงสร้าง
```
novacoin-exchange/
├── backend/       → Express API (Node.js)
├── frontend/      → Next.js (React)
└── DEPLOY.md      ← ไฟล์นี้
```

---

## ✅ ทางเลือกที่ 1: Render (backend) + Vercel (frontend) — ฟรี 100%

**ข้อดี**: ฟรีตลอด, custom domain ได้, ตั้งค่าง่าย  
**ข้อเสีย**: ฐานข้อมูลหายเมื่อ service restart (~ทุก 48ชม.) — เหมาะสำหรับเทสต์/โปรโมท  
**เวลา**: ~15 นาที

### ขั้นตอน

#### 1. Deploy Backend ที่ Render.com

1. ไปที่ https://dashboard.render.com → **New +** → **Web Service**
2. เชื่อมต่อ GitHub หรือ GitLab เลือก repo `novacoin-exchange`
3. ตั้งค่า:
   - **Name**: `novacoin-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
   - **Plan**: **Free** ✅
4. เพิ่ม Environment Variables:
   - `JWT_SECRET` → กด **Generate** (หรือพิมพ์ `NovaCoin_Secret_2026`)
   - `FRONTEND_URL` → `https://novacoin-exchange.vercel.app` (เปลี่ยนตามชื่อคุณ)
   - `ADMIN_EMAIL` → `admin@novacoin.io`
   - `ADMIN_PASSWORD` → `Admin@123456`
5. กด **Create Web Service** รอ ~2-3 นาที
6. คัดลอก URL ที่ได้ เช่น `https://novacoin-backend.onrender.com`
7. **Test**: เปิด `https://novacoin-backend.onrender.com/api/health` → ควรเห็น `{"status":"ok"}`

#### 2. Deploy Frontend ที่ Vercel

1. ไปที่ https://vercel.com → **Add New** → **Project**
2. เชื่อมต่อ GitHub → เลือก repo `novacoin-exchange`
3. ตั้งค่า:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Next.js`
   - **Build Command**: `next build` (เติมให้อัตโนมัติ)
4. เพิ่ม Environment Variable:
   - `BACKEND_URL` → `https://novacoin-backend.onrender.com` (URL จาก Render)
5. กด **Deploy** รอ ~2 นาที
6. Vercel จะให้ URL `https://novacoin-exchange.vercel.app`
7. **Test**: เปิด URL → ควรเห็นหน้า NovaCoin Exchange

#### 3. จับคู่ Frontend ↔ Backend

ไปที่ Render Dashboard:
- **Environment** → เพิ่ม `FRONTEND_URL` → `https://novacoin-exchange.vercel.app`
- กด **Manual Deploy** → **Clear build cache & Deploy**

### ป้องกัน Backend หลับ (Keep Alive)

Render ฟรีจะปิด service หลังจากไม่มีคนเข้า ~15 นาที  
แก้โดยใช้ UptimeRobot หรือ cron-job.org:

1. ไปที่ https://cron-job.org → สมัครฟรี
2. สร้าง Cron Job:
   - **URL**: `https://novacoin-backend.onrender.com/api/health`
   - **Every**: `5 minutes`
   - **Save**
3. ระบบจะ Ping ทุก 5 นาที ทำให้ Backend ตื่นตลอด 24/7! 🎉

---

## ✅ ทางเลือกที่ 2: Fly.io (backend) + Vercel (frontend) — ฟรี มี Persistent Storage

**ข้อดี**: ฟรีตลอด, **ข้อมูลไม่หาย** (มี persistent disk 3GB), custom domain  
**ข้อเสีย**: ต้องใช้ Credit Card สมัคร (แต่ไม่เสียเงินใน Free Tier)  
**เวลา**: ~20 นาที

### ขั้นตอน

#### 1. ติดตั้ง Fly.io CLI

```bash
# ติดตั้ง flyctl
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# ล็อกอิน
fly auth login
```

#### 2. Deploy Backend

```bash
cd backend
fly launch --name novacoin-backend
```

เลือก:
- **Region**: `bkk` (กรุงเทพ) หรือใกล้ที่สุด
- **Database**: ไม่ต้อง (ใช้ SQLite)
- **Deploy**: ไม่ (จะปรับเอง)

สร้างไฟล์ `fly.toml`:

```toml
app = "novacoin-backend"
primary_region = "bkk"

[build]
  builder = "heroku/buildpacks:20"

[http_service]
  internal_port = 5000
  force_https = true
  auto_stop_machines = false  # ไม่ให้ปิดเครื่อง

[[mounts]]
  source = "data"
  destination = "/data"

[env]
  PORT = "5000"
  DB_PATH = "/data/novacoin.db"
  UPLOAD_DIR = "/data/uploads"
  JWT_SECRET = "NovaCoin_SuperSecret_2026"
  FRONTEND_URL = "https://novacoin-exchange.vercel.app"
  ADMIN_EMAIL = "admin@novacoin.io"
  ADMIN_PASSWORD = "Admin@123456"
```

```bash
# สร้าง volume สำหรับ persistent storage
fly volumes create data --region bkk --size 1

# Deploy
fly deploy
```

#### 3. Deploy Frontend (Vercel)

เหมือนทางเลือกที่ 1 ข้อ 2

---

## ✅ ทางเลือกที่ 3: Supabase + Render + Vercel — ฟรี ฐานข้อมูลถาวร

**ข้อดี**: ฐานข้อมูล PostgreSQL 500MB ฟรีตลอด, ข้อมูลไม่หาย  
**ข้อเสีย**: ต้องย้ายจาก SQLite → PostgreSQL (ต้องแก้โค้ด)  
**เวลา**: ~30 นาที

> ทางเลือกนี้เหมาะสำหรับ production จริง

---

## 🌐 ตั้งชื่อเว็บเอง (Custom Domain)

### Vercel (Frontend)
1. ไปที่ Project → **Settings** → **Domains**
2. พิมพ์ชื่อโดเมน เช่น `novacoin.exchange`
3. ทำตามคำแนะนำ DNS ที่ Vercel ให้
4. **ข้อควรรู้**: จดโดเมนมีค่าใช้จ่าย ~$8-15/ปี (ที่ Namecheap, GoDaddy, หรือคนไทยที่ godaddy.com/th)

### ใช้ฟรีไม่มีโดเมนเป็นของตัวเอง
Vercel ให้ URL ฟรี: `https://novacoin-exchange.vercel.app`
Render ให้ URL ฟรี: `https://novacoin-backend.onrender.com`

---

## 🔥 Quick Deploy (กดเดียว)

### Backend (Render)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

> หรือทำตามขั้นตอนในทางเลือกที่ 1

### Frontend (Vercel)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

---

## 📝 สรุปค่าใช้จ่าย

| รายการ | ทางเลือก 1 (Render) | ทางเลือก 2 (Fly.io) | ทางเลือก 3 (Supabase) |
|--------|-------------------|-------------------|---------------------|
| Backend | ฟรี | ฟรี (ต้องใช้ Card) | ฟรี (Render) |
| Database | SQLite (ชั่วคราว) | SQLite (ถาวร 3GB) | PostgreSQL 500MB |
| Frontend | ฟรี (Vercel) | ฟรี (Vercel) | ฟรี (Vercel) |
| Custom Domain | Vercel ฟรี + ค่าโดเมน | Vercel ฟรี + ค่าโดเมน | Vercel ฟรี + ค่าโดเมน |
| **ข้อมูลหาย?** | ✅ ทุก ~48ชม. | ❌ ไม่หาย | ❌ ไม่หาย |
| **ตลอดชีพ?** | ✅ | ✅ (หลังยืนยัน Card) | ✅ |

## 🤖 Admin หลัง Deploy
- **Admin**: `admin@novacoin.io` / `Admin@123456`
- **Admin 2**: `mungonline@novacoin.io` / `54321T_tt`
- **PIN Admin**: `141200`
