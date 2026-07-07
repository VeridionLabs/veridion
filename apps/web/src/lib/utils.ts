import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function severityColor(severity: string): string {
  const colors: Record<string, string> = {
    CRITICAL: 'text-red-500 bg-red-500/10',
    HIGH: 'text-orange-500 bg-orange-500/10',
    MEDIUM: 'text-yellow-500 bg-yellow-500/10',
    LOW: 'text-green-500 bg-green-500/10',
    GAS: 'text-blue-500 bg-blue-500/10',
    INFORMATIONAL: 'text-gray-500 bg-gray-500/10',
  };
  return colors[severity] ?? colors.INFORMATIONAL ?? '';
}
