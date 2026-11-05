/**
 * Request validation for the notification endpoints.
 *
 * Kept free of Express and Supabase imports so it can be unit tested directly.
 */

/** Longest value accepted for any single template field. */
const MAX_FIELD_LENGTH = 2000;
/** Most template fields accepted in one notification payload. */
const MAX_FIELD_COUNT = 40;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 320 && EMAIL_PATTERN.test(value.trim());
}

/**
 * Validate a single notification request body.
 *
 * @param {unknown} body
 * @param {string[]} allowedTypes
 * @returns {{ok: true, value: {type: string, to: string, data: object}} | {ok: false, error: string}}
 */
export function validateNotification(body, allowedTypes) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be an object.' };
  }

  const { type, to, data } = body;

  if (typeof type !== 'string' || !type) {
    return { ok: false, error: 'Missing required field: type.' };
  }

  if (!allowedTypes.includes(type)) {
    return { ok: false, error: 'Unknown notification type.' };
  }

  if (!isValidEmail(to)) {
    return { ok: false, error: 'Field "to" must be a valid email address.' };
  }

  const dataResult = validateTemplateData(data);
  if (!dataResult.ok) return dataResult;

  return {
    ok: true,
    value: { type, to: to.trim(), data: dataResult.value },
  };
}

/**
 * Template data must be a flat object of primitives. Rejecting nested
 * structures keeps unexpected content out of rendered email bodies and
 * bounds the work done per request.
 */
export function validateTemplateData(data) {
  if (data === undefined || data === null) return { ok: true, value: {} };

  if (typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Field "data" must be an object.' };
  }

  const keys = Object.keys(data);
  if (keys.length > MAX_FIELD_COUNT) {
    return { ok: false, error: `Field "data" may contain at most ${MAX_FIELD_COUNT} fields.` };
  }

  const value = {};
  for (const key of keys) {
    const entry = data[key];

    if (entry === null || entry === undefined) continue;

    if (typeof entry === 'object') {
      return { ok: false, error: `Field "data.${key}" must be a string, number or boolean.` };
    }

    if (typeof entry === 'string' && entry.length > MAX_FIELD_LENGTH) {
      return { ok: false, error: `Field "data.${key}" exceeds ${MAX_FIELD_LENGTH} characters.` };
    }

    value[key] = entry;
  }

  return { ok: true, value };
}

/**
 * Validate a batch request body.
 *
 * @returns {{ok: true, value: object[]} | {ok: false, error: string}}
 */
export function validateBatch(body, allowedTypes, maxBatchSize) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be an object.' };
  }

  const { notifications } = body;

  if (!Array.isArray(notifications)) {
    return { ok: false, error: 'Missing required field: notifications (array).' };
  }

  if (notifications.length === 0) {
    return { ok: false, error: 'Field "notifications" must not be empty.' };
  }

  if (notifications.length > maxBatchSize) {
    return {
      ok: false,
      error: `A batch may contain at most ${maxBatchSize} notifications.`,
    };
  }

  const value = [];
  for (let index = 0; index < notifications.length; index += 1) {
    const result = validateNotification(notifications[index], allowedTypes);
    if (!result.ok) {
      return { ok: false, error: `notifications[${index}]: ${result.error}` };
    }
    value.push(result.value);
  }

  return { ok: true, value };
}

export const LIMITS = { MAX_FIELD_LENGTH, MAX_FIELD_COUNT };
