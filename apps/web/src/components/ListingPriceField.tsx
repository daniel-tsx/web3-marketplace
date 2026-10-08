import { useId } from 'react';
import { parseUnits } from 'viem';

export function listingPriceError(value: string, bits: 64 | 256): string | null {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) return 'Enter a positive price with up to six decimal places.';
  const amount = parseUnits(value, 6);
  if (amount <= 0n) return 'The listing price must be greater than zero.';
  if (amount > (1n << BigInt(bits)) - 1n) return 'This price exceeds the marketplace’s supported amount.';
  return null;
}

export function ListingPriceField({ value, onChange, bits, disabled }: { value: string; onChange: (value: string) => void; bits: 64 | 256; disabled?: boolean }) {
  const id = useId();
  const error = listingPriceError(value, bits);
  return <div className="listing-price"><label htmlFor={id}>Price in mUSDC</label><input id={id} value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />{error && <p id={`${id}-error`} className="error">{error}</p>}</div>;
}
