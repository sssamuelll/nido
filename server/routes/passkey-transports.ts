import { z } from 'zod';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';

const TRANSPORT_VALUES = [
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb',
] as const;

type PasskeyTransport = (typeof TRANSPORT_VALUES)[number];

const transportSchema = z.enum(TRANSPORT_VALUES);

const MAX_TRANSPORTS = 16;
const SAMPLE_LEN = 64;

export interface ParseTransportsContext {
  credentialId?: string;
}

const sample = (raw: string): string =>
  raw.length <= SAMPLE_LEN ? raw : `${raw.slice(0, SAMPLE_LEN)}...`;

const describeValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

export function parseTransports(
  raw: string | null | undefined,
  ctx: ParseTransportsContext = {},
): AuthenticatorTransportFuture[] {
  if (raw == null || raw === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn('[passkey] invalid transports row', {
      credential_id: ctx.credentialId,
      reason: 'json_parse_failed',
      sample: sample(raw),
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn('[passkey] invalid transports row', {
      credential_id: ctx.credentialId,
      reason: 'shape_invalid',
      received: describeValue(parsed),
      sample: sample(raw),
    });
    return [];
  }

  const result: PasskeyTransport[] = [];
  const limit = Math.min(parsed.length, MAX_TRANSPORTS);
  for (let i = 0; i < limit; i++) {
    const item = transportSchema.safeParse(parsed[i]);
    if (item.success) {
      result.push(item.data);
    } else {
      console.warn('[passkey] dropping unknown transport', {
        credential_id: ctx.credentialId,
        index: i,
        received: describeValue(parsed[i]),
      });
    }
  }
  return result;
}
