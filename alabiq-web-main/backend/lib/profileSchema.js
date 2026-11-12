const EXTENDED_FIELDS = [
  'date_of_birth',
  'gender',
  'national_id',
  'vehicle_type',
  'vehicle_plate',
];

const V2_FIELDS = ['avatar_url', 'address'];

function applyOptionalField(row, key, value) {
  if (value !== undefined) row[key] = value;
}

function buildProfileUpsert({ id, role, email, driverApproved, existing, body }) {
  const row = {
    id,
    role,
    email: email || null,
    driver_approved: driverApproved,
  };

  if (body.full_name !== undefined) {
    row.full_name = body.full_name;
  } else if (!existing) {
    row.full_name = null;
  }

  applyOptionalField(row, 'whatsapp_number', body.whatsapp_number);
  applyOptionalField(row, 'mobile_number', body.mobile_number);

  for (const key of [...EXTENDED_FIELDS, ...V2_FIELDS]) {
    applyOptionalField(row, key, body[key]);
  }

  return row;
}

module.exports = {
  EXTENDED_FIELDS,
  V2_FIELDS,
  buildProfileUpsert,
};
