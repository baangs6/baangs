const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(value) {
  if (!value) return '-';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}-${MONTHS[Number(match[2]) - 1]}-${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getDate()).padStart(2, '0')}-${MONTHS[date.getMonth()]}-${date.getFullYear()}`;
}

export function formatDateTime(value) {
  if (!value) return '-';
  const datePart = formatDate(value);
  const time = String(value).match(/[T\s](\d{2}):(\d{2})/);
  return time ? `${datePart} ${time[1]}:${time[2]}` : datePart;
}
