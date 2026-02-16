# OT Tracker (Thai) — GitHub Pages (No Build)

เวอร์ชันนี้ปรับจากโปรเจกต์ V7 เดิมให้ "รันบน GitHub Pages ได้ทันที" โดยไม่ต้อง build / ไม่ต้อง Vite

## วิธีใช้งาน
1) อัปโหลดไฟล์ทั้งหมดขึ้น repo (ให้มี `index.html` อยู่ที่ root)
2) ไปที่ Settings → Pages
   - Source: Deploy from a branch
   - Branch: main
   - Folder: /(root)
3) เปิดเว็บ: https://<username>.github.io/<repo>/

## จุดที่ปรับ
- index.html: ใช้ `./src/main.js` (ไม่ใช่ `/src/main.js`)
- เพิ่ม importmap ชี้ไป CDN (idb + FullCalendar) เพื่อให้ browser import ได้โดยตรง
- main.js: เอา `import './styles.css'` ออก แล้วใช้ `<link rel="stylesheet" href="./src/styles.css">` แทน
