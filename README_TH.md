# OT Tracker (Thai) — Static (GitHub Pages)

เวอร์ชันนี้เป็น **Static 100%**: อัปขึ้น GitHub แล้วรันได้เลย **ไม่ต้อง npm / ไม่ต้อง build** ✅

## ใช้งานบน GitHub Pages
1) สร้าง Repo ใหม่ (หรือใช้ repo เดิม) แล้วอัปโหลดไฟล์ทั้งหมดของโปรเจกต์นี้ลง root
2) ไปที่ **Settings → Pages**
   - Source: Deploy from a branch
   - Branch: main
   - Folder: /(root)
3) เปิดเว็บ: `https://<username>.github.io/<repo>/`

## เก็บข้อมูล
- เก็บในเครื่องด้วย `localStorage` (อัตโนมัติ)
- ส่งออก/นำเข้า JSON ได้ในเมนู “ส่งออก/นำเข้า”

## PDF
- กด “Report → Print/PDF” แล้วเลือก Save as PDF ในหน้า print ของเบราว์เซอร์
