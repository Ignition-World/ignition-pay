// utils/errorUtils.ts

/**
 * Create a user-friendly error message.
 * @param message The technical error message.
 * @returns A string suitable for displaying to end users.
 */
export function createUserError(message: string): string {
  // In a real app you might map error codes to messages.
  // For now we just prepend a friendly prefix.
  return `Error: ${message}`;
}

/**
 * Detect if an error is a timeout based on its message.
 * @param error The error object or string.
 * @returns true if it appears to be a timeout.
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return /timeout/i.test(error.message);
  }
  if (typeof error === 'string') {
    return /timeout/i.test(error);
  }
  return false;
}
