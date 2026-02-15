# OT Tracker (Thai) — Full (ฐานเงินเดือน + OT + ปฏิทิน + Export)

## จุดเด่น
- เก็บ OT/เวลางานแบบปฏิทิน (FullCalendar)
- คำนวณชั่วโมงสุทธิ (หักพัก, รองรับข้ามวัน)
- คิดเงินจาก "ฐานเงินเดือน" (หารวัน/เดือน = 30 ตามที่เดย์กำหนด)
- โหมดเงินเดือน: คงที่ / โปรเรทตามวัน / โปรเรทตามชั่วโมง
- เพิ่มสถานะวัน: มาทำงาน / หยุด(รายได้ 0) / ลากิจ / ลาป่วย
- ปุ่ม “ซ่อนเงิน” (UI + PDF)
- ใส่ รหัสพนักงาน + แผนก + บันทึกเมื่อ/แก้ไขล่าสุด
- Export: JSON / CSV / PDF (PDF เปิดหน้า “รายงาน” แล้วกดพิมพ์/บันทึกเป็น PDF)

---

## คำสั่ง Termux (ติดตั้ง + รัน)
1) ขอสิทธิ์อ่าน/เขียนไฟล์:
```bash
termux-setup-storage
```

2) ติดตั้ง Node + unzip:
```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git unzip
```

3) แตกไฟล์ (สมมติ zip อยู่ Downloads):
```bash
cd ~/storage/downloads
unzip -o ot-tracker-th-full-v4.zip
cd ot-tracker-th-full
npm install
```

### รันบนเครื่องตัวเอง (มือถือเปิดในเบราว์เซอร์)
```bash
npm run dev -- --host 127.0.0.1 --port 5173
```
เปิด: http://127.0.0.1:5173

### ปล่อย Wi-Fi ให้เครื่องอื่นเข้า (LAN)
```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

หา IP มือถือ:
```bash
ip route get 1.1.1.1 | awk '{print $7; exit}'
```
แล้วเครื่องอื่นเปิด:
http://IP_มือถือ:5173

> ถ้าเข้าไม่ได้: เช็คว่าอยู่ Wi‑Fi เดียวกัน + Router ไม่เปิด AP/Client Isolation + ปิด Battery Optimization ของ Termux

---

## โหมด PDF
- กด **Export PDF** แล้วเลือก
  - **OK** = วันเวลา + ยอดเงิน
  - **Cancel** = เฉพาะวันเวลา
- ถ้าเปิด “ซ่อนเงิน” ในตั้งค่า → PDF จะบังคับเป็น “เฉพาะวันเวลา”

## วิธีหยุดโปรเจกต์เก่าที่กำลังรัน
### ถ้าเห็น log วิ่งอยู่ใน Termux
กด:
- `CTRL + C`

### ถ้าหลุดหน้าจอ / ไม่รู้รันอยู่ไหน
ติดตั้ง lsof:
```bash
pkg install -y lsof
lsof -i :5173
```
จะเห็น PID แล้ว kill:
```bash
kill -9 <PID>
```

### ถ้าต้องการโหมด "รันไม่หลุด" (แนะนำ)
```bash
pkg install -y tmux termux-api
termux-wake-lock
tmux new -s ot
npm run dev -- --host 0.0.0.0 --port 5173
```
ออกจาก tmux แบบไม่ปิดงาน: `CTRL+b` แล้วกด `d`
กลับเข้า: `tmux attach -t ot`
ปลด wake lock: `termux-wake-unlock`


## รันบน GitHub Pages (แบบไม่ต้อง build)

1) อัปโหลดไฟล์ทั้งหมดในโปรเจกต์นี้ขึ้น repo (ให้ `index.html` อยู่ที่ root)
2) Settings → Pages
   - Source: Deploy from a branch
   - Branch: main
   - Folder: /(root)
3) เปิดเว็บ: `https://<username>.github.io/<repo>/`

> หมายเหตุ: เวอร์ชันนี้เป็น Static/ESM ตรง ๆ ในเบราว์เซอร์ จึงไม่ต้องใช้ Vite หรือคำสั่ง build
