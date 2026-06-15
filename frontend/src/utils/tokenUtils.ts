/**
 * Ported from docgen-frontend/src/utils/tokenUtils.js.
 * Token-kind detection and normalization helpers.
 */

function isJwtLike(value: string): boolean {
  return /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value.trim());
}

/**
 * Removes 'bearer:' or 'Bearer ' prefix from a token string.
 */
export function stripBearerPrefix(token: string): string {
  const raw = String(token ?? '').trim();
  if (!raw) return '';
  if (/^bearer:/i.test(raw)) return raw.slice('bearer:'.length).trim();
  if (/^bearer\s+/i.test(raw)) return raw.replace(/^bearer\s+/i, '').trim();
  return raw;
}

/**
 * Returns true when the token is a bearer/JWT access token.
 */
export function isAccessToken(token: string): boolean {
  const stripped = stripBearerPrefix(token);
  if (!stripped) return false;
  return isJwtLike(stripped);
}

/**
 * Classifies a token as 'bearer', 'pat', or 'unknown'.
 * - 'bearer': JWT-like access token (three dot-separated base64url segments)
 * - 'pat': non-empty string that is not JWT-like (Azure DevOps PAT)
 * - 'unknown': empty / not a string
 */
export function getTokenKind(token: string): 'pat' | 'bearer' | 'unknown' {
  const raw = String(token ?? '').trim();
  if (!raw) return 'unknown';
  return isAccessToken(raw) ? 'bearer' : 'pat';
}

/**
 * Ensures the token is in `bearer:<token>` format for internal use.
 * If already prefixed, normalises to lowercase `bearer:` form.
 */
export function normalizeToBearerHeader(token: string): string {
  const stripped = stripBearerPrefix(token);
  if (!isAccessToken(stripped)) {
    throw new Error('normalizeToBearerHeader: token is not a bearer/JWT token');
  }
  return `bearer:${stripped}`;
}
