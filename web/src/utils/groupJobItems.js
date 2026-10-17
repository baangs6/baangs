// Keep the original usage records so grouping never changes stock allocations.
export function groupJobItems(items) {
  const groups = [];
  const serialized = new Map();
  for (const row of items) {
    const key = row.serial_number?.trim() && Number(row.quantity_used) === 1
      ? JSON.stringify([row.barcode, row.model_number || '', Number(row.unit_selling_price || 0), row.warranty_years == null || row.warranty_years === '' ? null : Number(row.warranty_years)])
      : null;
    let group = key === null ? null : serialized.get(key);
    if (!group) {
      group = { ...row, records: [], quantity_used: 0 };
      groups.push(group);
      if (key !== null) serialized.set(key, group);
    }
    group.records.push(row);
    group.quantity_used += Number(row.quantity_used || 0);
  }
  return groups;
}
