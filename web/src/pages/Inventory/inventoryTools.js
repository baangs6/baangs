export const money = value => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const serialsOf = item => item?.serial_numbers?.length ? item.serial_numbers : String(item?.serial_number || '').split(',').map(value => value.trim()).filter(Boolean);
export const lowStock = item => Number(item.current_quantity) <= Number(item.minimum_stock_level || 0);
export function downloadCsv(name, fields, rows) {
  const cell = value => { let text = String(value ?? ''); if (/^\s*[=+@-]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  const csv = [fields, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printRows(title, fields, rows) {
  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) return false;
  win.opener = null; win.document.title = title;
  const heading = win.document.createElement('h1'); heading.textContent = `BAANGS - ${title}`; win.document.body.append(heading);
  const table = win.document.createElement('table'); table.style.cssText = 'border-collapse:collapse;width:100%';
  for (const [index, row] of [fields, ...rows].entries()) {
    const tr = win.document.createElement('tr');
    for (const value of row) { const cell = win.document.createElement(index ? 'td' : 'th'); cell.textContent = String(value ?? '-'); cell.style.cssText = 'padding:10px;border:1px solid #ddd;text-align:left;white-space:pre-wrap'; tr.append(cell); }
    table.append(tr);
  }
  win.document.body.style.cssText = 'font:12px Arial,sans-serif;color:#123;padding:20px'; win.document.body.append(table); win.focus(); win.print(); return true;
}
