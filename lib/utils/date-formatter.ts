import { format as dateFnsFormat } from 'date-fns';

/**
 * Format a date to a readable string in the user's local timezone
 * @param date - Date object or ISO string
 * @param formatString - date-fns format string (default: 'MMM d, yyyy')
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string,
  formatString: string = 'MMM d, yyyy'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, formatString);
}

/**
 * Format a datetime with time in the user's local timezone
 * @param date - Date object or ISO string
 * @param formatString - date-fns format string (default: 'MMM d, yyyy h:mm a')
 * @returns Formatted datetime string
 */
export function formatDateTime(
  date: Date | string,
  formatString: string = 'MMM d, yyyy h:mm a'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateFnsFormat(dateObj, formatString);
}
