import { format, startOfDay, startOfWeek, startOfMonth } from 'date-fns';

export function groupByDay(data) {
  const grouped = {};
  data.forEach(item => {
    const dateKey = format(startOfDay(new Date(item.date)), 'yyyy-MM-dd');
    if (!grouped[dateKey]) {
      grouped[dateKey] = { date: dateKey, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    }
    grouped[dateKey].input += item.input || 0;
    grouped[dateKey].output += item.output || 0;
    grouped[dateKey].cacheRead += item.cacheRead || 0;
    grouped[dateKey].cacheWrite += item.cacheWrite || 0;
    grouped[dateKey].cost += item.cost || 0;
  });
  return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function groupByWeek(data) {
  const grouped = {};
  data.forEach(item => {
    const date = new Date(item.date);
    const weekStart = startOfWeek(date, { weekStartsOn: 0 });
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    if (!grouped[weekKey]) {
      grouped[weekKey] = { date: weekKey, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    }
    grouped[weekKey].input += item.input || 0;
    grouped[weekKey].output += item.output || 0;
    grouped[weekKey].cacheRead += item.cacheRead || 0;
    grouped[weekKey].cacheWrite += item.cacheWrite || 0;
    grouped[weekKey].cost += item.cost || 0;
  });
  return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function groupByMonth(data) {
  const grouped = {};
  data.forEach(item => {
    const date = new Date(item.date);
    const monthKey = format(startOfMonth(date), 'yyyy-MM');
    if (!grouped[monthKey]) {
      grouped[monthKey] = { date: monthKey, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    }
    grouped[monthKey].input += item.input || 0;
    grouped[monthKey].output += item.output || 0;
    grouped[monthKey].cacheRead += item.cacheRead || 0;
    grouped[monthKey].cacheWrite += item.cacheWrite || 0;
    grouped[monthKey].cost += item.cost || 0;
  });
  return Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));
}
