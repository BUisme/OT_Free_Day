import { computeDayMoney } from '../lib/money.js';

// FullCalendar (no-build): use global bundle loaded via <script> in index.html
function getFC() {
  return globalThis.FullCalendar || null;
}

export function mountCalendar(container, store, onEditDate) {
  const FC = getFC();
  if (!FC || !FC.Calendar) {
    // graceful fallback: keep the app usable even if CDN is blocked/offline
    container.innerHTML = `
      <div class="notice bad">
        <b>⚠️ ปฏิทินโหลดไม่สำเร็จ</b><br/>
        ไม่พบไลบรารี FullCalendar (global).<br/>
        • ลองรีเฟรชหน้าเว็บ<br/>
        • เช็คว่าเน็ต/ตัวบล็อคโฆษณาไม่ได้บล็อค CDN<br/>
      </div>
    `;
    return { calendar: null, refresh: () => {} };
  }
  const Calendar = FC.Calendar;
  const dayGridPlugin = FC.dayGridPlugin;
  const interactionPlugin = FC.interactionPlugin;

  const { state } = store;

  function buildEvents() {
    const events = [];
    const hideMoney = !!state.settings?.privacyHideMoney;

    for (const r of state.records || []) {
      const c = r.computed || {};
      const m = computeDayMoney(r, state.settings);

      const hasHours = (c.workHoursNet||0) > 0 || (c.otHoursNet||0) > 0;
      const isAttendanceOnly = (r.attendance && r.attendance !== 'present');

      // show:
      // - days with hours
      // - days with attendance off/leave (even if 0 hours)
      if (!hasHours && !isAttendanceOnly) continue;

      const titleParts = [];
      // status first
      if (isAttendanceOnly) {
        if (r.attendance === 'off') titleParts.push('🛑 หยุด');
        else if (r.attendance === 'personal') titleParts.push('📝 ลากิจ');
        else if (r.attendance === 'sick') titleParts.push('🤒 ลาป่วย');
      } else {
        titleParts.push('✅ งาน');
      }

      if ((c.otHoursNet||0) > 0) titleParts.push(`OT ${c.otHoursNet.toFixed(2)}h`);
      if ((c.workHoursNet||0) > 0 && (c.otHoursNet||0) === 0) titleParts.push(`${c.workHoursNet.toFixed(2)}h`);
      if (!hideMoney && (m.grossDay||0) > 0) titleParts.push(`฿${m.grossDay.toFixed(0)}`);

      events.push({
        id: r.date,
        title: titleParts.join(' • '),
        start: r.date,
        allDay: true,
      });
    }
    return events;
  }

  const cal = new Calendar(container, {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    height: 'auto',
    timeZone: 'local',
    locale: 'th',
    selectable: true,
    dayMaxEvents: true,
    headerToolbar: {
      left: 'prev,next',
      center: 'title',
      right: 'today'
    },
    dateClick: (info) => onEditDate?.(info.dateStr),
    eventClick: (info) => onEditDate?.(info.event.id),
    events: buildEvents(),
  });

  cal.render();

  function refresh() {
    cal.removeAllEvents();
    cal.addEventSource(buildEvents());
  }

  return { calendar: cal, refresh };
}
