// ---------------------------------------------------------------------
// Tiny request-body validation layer (no new dependencies).
//
// validateBody(schema) returns Express middleware that checks req.body
// against a small per-route schema, REJECTS unknown fields, coerces
// nothing silently, and replaces req.body with only the validated
// fields — so controllers never see injected extras.
//
//   validateBody({
//     name:     { type: 'string', required: true, maxLength: 120 },
//     quantity: { type: 'integer', min: 1, max: 50 },
//     lat:      { type: 'number', nullable: true },
//     item_type:{ type: 'string', enum: ['meal_package', 'drink_dessert_addon'] },
//     params:   { type: 'object' },
//   })
//
// Rules per field: type ('string'|'number'|'integer'|'boolean'|'object'|'array'),
// required, nullable, enum, min/max (numbers), maxLength (strings/objects
// where objects are capped by their JSON size), maxItems/itemEnum (arrays
// of strings).
// ---------------------------------------------------------------------

function checkField(name, value, rule, errors) {
  if (value === undefined) {
    if (rule.required) errors.push(`${name} is required`);
    return undefined;
  }
  if (value === null) {
    if (rule.nullable) return null;
    errors.push(`${name} must not be null`);
    return undefined;
  }

  switch (rule.type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push(`${name} must be a string`);
        return undefined;
      }
      const trimmed = value.trim();
      if (rule.required && !trimmed) {
        errors.push(`${name} must not be empty`);
        return undefined;
      }
      const maxLength = rule.maxLength || 2000;
      if (trimmed.length > maxLength) {
        errors.push(`${name} must be at most ${maxLength} characters`);
        return undefined;
      }
      if (rule.enum && !rule.enum.includes(trimmed)) {
        errors.push(`${name} must be one of: ${rule.enum.join(', ')}`);
        return undefined;
      }
      return trimmed;
    }
    case 'number':
    case 'integer': {
      const n = Number(value);
      if (typeof value === 'boolean' || value === '' || !Number.isFinite(n)) {
        errors.push(`${name} must be a number`);
        return undefined;
      }
      if (rule.type === 'integer' && !Number.isInteger(n)) {
        errors.push(`${name} must be an integer`);
        return undefined;
      }
      if (rule.min != null && n < rule.min) {
        errors.push(`${name} must be >= ${rule.min}`);
        return undefined;
      }
      if (rule.max != null && n > rule.max) {
        errors.push(`${name} must be <= ${rule.max}`);
        return undefined;
      }
      return n;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        errors.push(`${name} must be a boolean`);
        return undefined;
      }
      return value;
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${name} must be an object`);
        return undefined;
      }
      const maxLength = rule.maxLength || 4000;
      if (JSON.stringify(value).length > maxLength) {
        errors.push(`${name} is too large`);
        return undefined;
      }
      return value;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${name} must be an array`);
        return undefined;
      }
      const maxItems = rule.maxItems || 20;
      if (value.length > maxItems) {
        errors.push(`${name} must have at most ${maxItems} items`);
        return undefined;
      }
      // itemType 'object': array of plain objects (size-capped as JSON);
      // the controller does the per-field validation.
      if (rule.itemType === 'object') {
        const maxLength = rule.maxLength || 4000;
        if (JSON.stringify(value).length > maxLength) {
          errors.push(`${name} is too large`);
          return undefined;
        }
        for (const item of value) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            errors.push(`${name} items must be objects`);
            return undefined;
          }
        }
        return value;
      }
      const items = [];
      for (const item of value) {
        if (typeof item !== 'string') {
          errors.push(`${name} items must be strings`);
          return undefined;
        }
        const trimmed = item.trim();
        if (rule.itemEnum && !rule.itemEnum.includes(trimmed)) {
          errors.push(`${name} items must be one of: ${rule.itemEnum.join(', ')}`);
          return undefined;
        }
        items.push(trimmed);
      }
      return items;
    }
    default:
      errors.push(`${name} has an unknown validation type`);
      return undefined;
  }
}

// Password bounds, enforced everywhere we set a password on an auth account:
// public signup (authController) and admin-provisioned merchant owners
// (adminFoodController / adminShopController). Supabase Auth hashes the value;
// the upper bound just stops a pathologically long input reaching the hasher.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

// Returns an error message when the password is unusable, or null when it is
// fine. The message NEVER quotes the password back.
function passwordError(value) {
  const password = typeof value === 'string' ? value : '';
  if (!password) return 'password is required';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// Email shape at any public boundary. Hoisted out of authController so the
// signup check and the frontend validator read from one expression — they had
// drifted apart once, and the client accepting what the server rejects shows
// up as a bare 400 with no field attached to it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 200;

function emailError(value) {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!email) return 'email is required';
  if (email.length > MAX_EMAIL_LENGTH) {
    return `Email must be at most ${MAX_EMAIL_LENGTH} characters`;
  }
  if (!EMAIL_RE.test(email)) return 'Please enter a valid email address';
  return null;
}

// Matches the cap already applied to full_name on PATCH /api/auth/profile and
// the admin routes. The profiles column is bare `text`, so this is the only
// thing standing between the form and an unbounded write.
const MAX_NAME_LENGTH = 120;

function nameError(value, label = 'Name') {
  if (value === undefined || value === null || value === '') return null;
  const name = String(value).trim();
  if (name.length > MAX_NAME_LENGTH) {
    return `${label} must be at most ${MAX_NAME_LENGTH} characters`;
  }
  return null;
}

function validateBody(schema) {
  return (req, res, next) => {
    const body = req.body || {};
    const errors = [];

    // Reject anything the route did not declare (prevents mass assignment).
    for (const key of Object.keys(body)) {
      if (!schema[key]) errors.push(`Unknown field: ${key}`);
    }

    const cleaned = {};
    for (const [name, rule] of Object.entries(schema)) {
      const value = checkField(name, body[name], rule, errors);
      if (value !== undefined) cleaned[name] = value;
    }

    if (errors.length) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.body = cleaned;
    return next();
  };
}

module.exports = {
  validateBody,
  passwordError,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  emailError,
  nameError,
  EMAIL_RE,
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
};
