import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPHP(amount: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

/**
 * Calculates the daily pay with an 8-hour cap.
 * @param startTime ISO string
 * @param endTime ISO string
 * @param hourlyRate number
 * @returns number
 */
export function calculateDailyPay(startTime: string, endTime: string, hourlyRate: number) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  
  if (isNaN(start) || isNaN(end)) return 0;
  
  const diffInMs = end - start;
  if (diffInMs <= 0) return 0;
  
  const hours = diffInMs / (1000 * 60 * 60);
  const cappedHours = Math.min(hours, 8);
  
  return cappedHours * hourlyRate;
}
