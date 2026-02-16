import { computeDayMoney } from '../lib/money.js';

// FullCalendar (no-build): use global build loaded via <script> in index.html
const FC = globalThis.FullCalendar;
if (!FC) throw new Error('FullCalendar global is missing. Check index.html script tags.');
const Calendar = FC.Calendar;
const dayGridPlugin = FC.dayGridPlugin;
const interactionPlugin = FC.interactionPlugin;

export function mountCalendar(container, store, onEditDate) {
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
