export const InvoiceStatus = {
  PENDING: 'pending',
  PAID:    'paid',
  OVERDUE: 'overdue',
} as const;

export type InvoiceStatusValue = typeof InvoiceStatus[keyof typeof InvoiceStatus];

export const PaymentCache = {
  PREFIX:  'idem:payment:',
  TTL_SEC: 24 * 3600,
} as const;
