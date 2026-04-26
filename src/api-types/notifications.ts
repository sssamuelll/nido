import { z } from 'zod';

const MAX_TYPE_LEN = 64;
const MAX_TITLE_LEN = 256;
const MAX_MESSAGE_LEN = 4096;
const MAX_TIMESTAMP_LEN = 64;
const MAX_NOTIFICATIONS = 200;

const finiteDateSchema = z
  .string()
  .min(1)
  .max(MAX_TIMESTAMP_LEN)
  .refine(v => Number.isFinite(Date.parse(v)), 'must parse to a valid Date');

const notificationSchema = z
  .object({
    id: z.number().int().finite().positive(),
    type: z.string().min(1).max(MAX_TYPE_LEN),
    title: z.string().min(1).max(MAX_TITLE_LEN),
    message: z.string().max(MAX_MESSAGE_LEN).nullable(),
    is_read: z.union([z.literal(0), z.literal(1)]),
    created_at: finiteDateSchema,
  })
  .passthrough();

const notificationListSchema = z.array(notificationSchema).max(MAX_NOTIFICATIONS);

export type Notification = z.infer<typeof notificationSchema>;

export class NotificationParseError extends Error {
  readonly path: ReadonlyArray<string | number>;
  readonly receivedKind: string;

  constructor(message: string, path: ReadonlyArray<string | number>, receivedKind: string) {
    super(message);
    this.name = 'NotificationParseError';
    this.path = path;
    this.receivedKind = receivedKind;
  }
}

const describeKind = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(len=${v.length})`;
  return typeof v;
};

export function parseNotificationList(input: unknown): Notification[] {
  const result = notificationListSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const pathStr = issue.path.length === 0 ? '<root>' : issue.path.join('.');
  const err = new NotificationParseError(
    `notification list parse failed at ${pathStr}: ${issue.message}`,
    issue.path,
    describeKind(input),
  );
  console.warn('[api] notification list parse failed', {
    path: err.path,
    receivedKind: err.receivedKind,
    issue: issue.message,
  });
  throw err;
}
