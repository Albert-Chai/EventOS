/**
 * Structured error codes (spec §16).
 *
 * Codes are part of the public API contract: clients switch on them, so they
 * must never be renamed once shipped. Messages may change freely; codes may not.
 */
export const ERROR_CODES = {
  // --- Auth / access ------------------------------------------------------
  UNAUTHENTICATED: { status: 401, message: "Authentication is required." },
  SESSION_EXPIRED: { status: 401, message: "Your session has expired. Please sign in again." },
  REAUTH_REQUIRED: { status: 401, message: "This action requires recent authentication." },
  FORBIDDEN: { status: 403, message: "You do not have permission to perform this action." },
  TENANT_MISMATCH: { status: 403, message: "This resource belongs to another organizer." },

  // --- Request ------------------------------------------------------------
  VALIDATION_ERROR: { status: 422, message: "The request contained invalid data." },
  MALFORMED_REQUEST: { status: 400, message: "The request could not be parsed." },
  METHOD_NOT_ALLOWED: { status: 405, message: "This method is not allowed for this endpoint." },

  // --- Resources ----------------------------------------------------------
  NOT_FOUND: { status: 404, message: "The requested resource was not found." },
  EVENT_NOT_FOUND: { status: 404, message: "The requested event was not found." },
  MERCHANT_NOT_FOUND: { status: 404, message: "The requested merchant was not found." },
  BOOTH_NOT_FOUND: { status: 404, message: "The requested booth was not found." },
  CONFLICT: { status: 409, message: "The resource is in a conflicting state." },
  VOUCHER_NOT_FOUND: { status: 404, message: "The requested voucher was not found." },
  VOUCHER_CODE_NOT_FOUND: { status: 404, message: "That voucher code was not found." },
  VOUCHER_NOT_CLAIMABLE: { status: 409, message: "This voucher is not available right now." },
  VOUCHER_SOLD_OUT: { status: 409, message: "All of these vouchers have been claimed." },
  VOUCHER_LIMIT_REACHED: { status: 409, message: "You have already claimed this voucher." },
  VOUCHER_ALREADY_REDEEMED: { status: 409, message: "That voucher code has already been used." },
  VOUCHER_EXPIRED: { status: 409, message: "That voucher code has expired." },
  CAMPAIGN_NOT_FOUND: { status: 404, message: "The requested campaign was not found." },
  SLUG_TAKEN: { status: 409, message: "That slug is already in use." },
  BOOTH_NUMBER_TAKEN: { status: 409, message: "That booth number is already used in this event." },
  BOOTH_NOT_ASSIGNABLE: { status: 409, message: "That booth is not open for assignment." },
  INVALID_STATE_TRANSITION: { status: 409, message: "That status change is not allowed." },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: "That file type is not supported." },
  FILE_TOO_LARGE: { status: 413, message: "That file is too large." },

  // --- Limits -------------------------------------------------------------
  RATE_LIMITED: { status: 429, message: "Too many requests. Please try again shortly." },
  PLAN_LIMIT_REACHED: { status: 402, message: "Your plan limit has been reached." },
  PLAN_FEATURE_REQUIRED: { status: 402, message: "Your plan does not include this feature." },

  // --- Server -------------------------------------------------------------
  INTERNAL_ERROR: { status: 500, message: "Something went wrong on our end." },
  SERVICE_UNAVAILABLE: { status: 503, message: "A required service is unavailable." },
  NOT_CONFIGURED: { status: 503, message: "This feature is not configured in this environment." },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
