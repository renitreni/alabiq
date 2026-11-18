export function daysInMonth(month, year) {
  if (!month || !year) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

export function buildDateOfBirth(day, month, year) {
  if (!day || !month || !year) return '';
  return `${year}-${month}-${String(day).padStart(2, '0')}`;
}

export function buildFullPhone(region, local) {
  const digits = local.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  return `${region}${digits}`;
}

export function isValidLocalPhone(local) {
  const digits = local.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}