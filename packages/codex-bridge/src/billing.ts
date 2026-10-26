import { readFileSync } from 'node:fs';
import { join } from 'node:path';
export function billingConfirmation(directory: string) {
  try {
    const value = JSON.parse(readFileSync(join(directory, 'billing-confirmation.json'), 'utf8'));
    const age = Date.now() - Date.parse(value.confirmedAt);
    return { verifiedByUser: value.source === 'user_confirmation' && value.paidContinuationDisabled === true &&
      value.autoTopUpDisabled === true && age >= 0 && age < 24 * 60 * 60 * 1000,
      automaticAccountVerification: false, confirmedAt: value.confirmedAt ?? null };
  } catch { return { verifiedByUser: false, automaticAccountVerification: false, confirmedAt: null }; }
}
