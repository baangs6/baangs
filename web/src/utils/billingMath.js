export function calculateBillingProfit(billing = {}) {
  const invoice = Number(billing.invoice_amount || 0);
  const expense = Number(billing.expense || 0);
  const material = Number(billing.material_amount || 0);
  const profit = invoice - expense - material;
  const percentage = invoice > 0 ? (profit / invoice) * 100 : 0;
  return { profit, percentage };
}
