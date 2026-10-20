/**
 * "₹1,234.50", "₹800" — Indian grouping, paise only when there are any.
 * Amounts in emails used to print raw ("₹1234.5"). '' for a non-number.
 */
function inr(value) {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
}

module.exports = { inr };
