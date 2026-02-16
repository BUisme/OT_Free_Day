import { normalizeRange, duration } from './time.js';
import { normalizeBreaks, overlapMinutes } from './interval.js';

export function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

function zeros(){
  return {
    workMinutesNet: 0,
    otMinutesNet: 0,
    totalMinutesNet: 0,
    workHoursNet: 0,
    otHoursNet: 0,
    totalHoursNet: 0,
  };
}

/**
 * Compute net work/OT minutes and hours.
 * Attendance rule:
 * - off: all zeros
 * - personal/sick: workHours = standardHoursPerDay, OT = 0
 * - present: compute from times and subtract overlapping breaks
 */
export function computeComputed(record, settings=null) {
  const attendance = record?.attendance || 'present';
  const standardHoursPerDay = Number(settings?.standardHoursPerDay || 8);

  if (attendance === 'off') return zeros();

  if (attendance === 'personal' || attendance === 'sick') {
    const workMinutesNet = Math.max(0, Math.round(standardHoursPerDay * 60));
    return {
      workMinutesNet,
      otMinutesNet: 0,
      totalMinutesNet: workMinutesNet,
      workHoursNet: round2(workMinutesNet/60),
      otHoursNet: 0,
      totalHoursNet: round2(workMinutesNet/60),
    };
  }

  const breaks = normalizeBreaks(record?.breaks || []);
  const workRange = normalizeRange(record?.workStart, record?.workEnd);
  const otRange = normalizeRange(record?.otStart, record?.otEnd);

  const workMinutes = duration(workRange);
  const otMinutes = duration(otRange);

  const workOverlap = workRange ? overlapMinutes(breaks, workRange) : 0;
  const otOverlap = otRange ? overlapMinutes(breaks, otRange) : 0;

  const workMinutesNet = Math.max(0, workMinutes - workOverlap);
  const otMinutesNet = Math.max(0, otMinutes - otOverlap);
  const totalMinutesNet = workMinutesNet + otMinutesNet;

  return {
    workMinutesNet,
    otMinutesNet,
    totalMinutesNet,
    workHoursNet: round2(workMinutesNet/60),
    otHoursNet: round2(otMinutesNet/60),
    totalHoursNet: round2(totalMinutesNet/60),
  };
}
