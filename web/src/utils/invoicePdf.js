import { formatDate } from './dateFormat.js';

const esc = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');
const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function text(value, x, y, size = 10, bold = false, color = '0 0 0') {
  return `BT /F${bold ? 2 : 1} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${esc(value)}) Tj ET\n`;
}

function line(x1, y1, x2, y2, width = 0.5, color = '0 0 0') {
  return `${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function rect(x, y, width, height, fill = null, stroke = '0.8 0.8 0.8') {
  return `${fill ? `${fill} rg ${x} ${y} ${width} ${height} re f\n` : ''}${stroke} RG ${x} ${y} ${width} ${height} re S\n`;
}

function numberWords(number) {
  const ones = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const underThousand = (value) => {
    const parts = [];
    if (value >= 100) { parts.push(`${ones[Math.floor(value / 100)]} hundred`); value %= 100; }
    if (value >= 20) { parts.push(tens[Math.floor(value / 10)]); value %= 10; }
    if (value) parts.push(ones[value]);
    return parts.join(' ');
  };
  let value = Math.max(0, Math.round(Number(number || 0)));
  if (!value) return 'zero';
  const parts = [];
  [[10000000, 'crore'], [100000, 'lakh'], [1000, 'thousand']].forEach(([divisor, label]) => {
    if (value >= divisor) { parts.push(`${underThousand(Math.floor(value / divisor))} ${label}`); value %= divisor; }
  });
  if (value) parts.push(underThousand(value));
  return parts.join(' ');
}

function makeDocument(pageStreams) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageStreams.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pageStreams.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  pageStreams.forEach((stream, index) => {
    const contentId = 6 + index * 2;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([new TextEncoder().encode(pdf)], { type: 'application/pdf' });
}

export function createInvoicePdf(job, billing) {
  const products = (job.inventory_used || []).map((item) => ({
    description: item.item_name || item.barcode || 'Material',
    qty: Number(item.quantity_used || 0),
    price: Number(item.unit_selling_price || 0),
  }));
  const material = products.reduce((sum, item) => sum + item.qty * item.price, 0);
  const total = Number(billing.invoice_amount || 0);
  const service = Number(billing.service_amount ?? Math.max(0, total - material));
  if (service > 0 || products.length === 0) products.push({ description: `${job.work_type || 'Service'} service charge`, qty: 1, price: service });

  let first = '';
  first += text('BAANGS', 72, 755, 38, true, '0.03 0.62 0.85');
  first += text('CCTV Solutions & Home Automation', 74, 735, 10, true, '0.14 0.30 0.10');
  first += text('GSTIN: 32AATFB0134F1ZW', 74, 718, 9);
  first += text('www.baangs.in', 74, 701, 9);
  first += text('BAANGS TECHNOMAC LLP', 340, 760, 11, true);
  ['1/278 & 1/279, Vadakkumbad,', 'Thalassery, Kannur, India 670105.', 'support@baangs.in', 'Phone: 8330033280, 8848133004'].forEach((row, i) => { first += text(row, 340, 741 - i * 16, 9); });
  first += line(65, 685, 530, 685, 1);
  first += text('BILL', 275, 655, 16, true, '0.14 0.30 0.10');
  first += text(`BILL NO : ${billing.billing_id || job.job_id}`, 72, 620, 10, true);
  first += text(`Date : ${formatDate(billing.complete_date || new Date())}`, 420, 620, 10, true);
  first += text('Prepared For:', 72, 592, 10, true);
  first += text(job.customer_name || '', 72, 574, 11, true, '0 0 1');
  first += text(job.phone_number || '', 72, 558, 9);
  first += text(job.location || '', 72, 542, 9);

  const columns = [65, 100, 355, 402, 470, 530];
  let y = 500;
  first += rect(65, y, 465, 25, '0.96 0.65 0', '0.96 0.65 0');
  ['SL.#', 'ITEM / SERVICE', 'QTY', 'UNIT PRICE', 'AMOUNT'].forEach((label, i) => { first += text(label, columns[i] + 5, y + 8, 9, true); });
  products.slice(0, 14).forEach((item, index) => {
    y -= 25;
    first += rect(65, y, 465, 25);
    columns.slice(1, -1).forEach((x) => { first += line(x, y, x, y + 25, 0.35, '0.8 0.8 0.8'); });
    first += text(index + 1, 78, y + 8, 9);
    first += text(String(item.description).toUpperCase().slice(0, 44), 105, y + 8, 9);
    first += text(item.qty, 370, y + 8, 9);
    first += text(money(item.price), 408, y + 8, 8, true, '0.14 0.30 0.10');
    first += text(money(item.qty * item.price), 473, y + 8, 8, true, '0.14 0.30 0.10');
  });
  y -= 28;
  first += text('TOTAL', 415, y + 8, 10, true, '0.14 0.30 0.10');
  first += text(money(total), 473, y + 8, 9, true, '0.14 0.30 0.10');
  first += text(`Rupees ${numberWords(total)} only`, 250, y - 18, 9, true, '0.14 0.30 0.10');
  first += text(`Payment: ${(billing.payment_mode || '-').replaceAll('_', ' ')}   Reference: ${billing.payment_id || '-'}`, 310, y - 42, 9, true);
  first += text('www.baangs.in', 260, 28, 8);
  first += text('Page 1', 500, 28, 8);

  let second = '';
  second += line(65, 790, 530, 790, 1);
  second += text('continued..', 470, 772, 9);
  second += text('TERMS AND CONDITIONS:', 72, 745, 11, true);
  second += text('Warranty:', 72, 715, 10, true, '0.14 0.30 0.10');
  ['All cameras, Digital Video Recorders (DVRs), and Network Video Recorders (NVRs)', 'are covered for the manufacturer warranty period from the date of original purchase.', 'Warranty Voids', 'External Forces: Damage from lightning strikes, power surges, floods.', 'Vandalism: Physical damage, glass breakage, or tampering by unauthorized persons.', '', 'Thanking you and looking forward to receiving your valued reply/order at the earliest.'].forEach((row, i) => { second += text(row, 72, 695 - i * 17, 9); });
  second += text('Sahil', 72, 555, 10, true);
  second += text('Managing Director', 72, 538, 9, true);
  second += text('Baangs Technomac LLP', 72, 521, 9);
  second += text('Thalassery, Kannur.', 72, 504, 9);
  second += text('Mobile: 8330033280', 72, 487, 9);
  second += rect(72, 390, 360, 78, null, '0.12 0.25 0.63');
  ['Bank Name: INDIAN BANK, THALASSERY, KANNUR', 'Bank Account No.: 6622965970', 'Bank IFSC code: IDIB000T007', 'Account Holder Name: Baangs Technomac LLP'].forEach((row, i) => { second += text(row, 80, 448 - i * 17, 9, true, '0.12 0.25 0.63'); });
  second += text('www.baangs.in', 260, 28, 8);
  second += text('Page 2', 500, 28, 8);
  return makeDocument([first, second]);
}
