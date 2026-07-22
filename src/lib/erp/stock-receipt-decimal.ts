export interface CanonicalDecimal {
  readonly scale: number;
  readonly scaled: bigint;
  readonly text: string;
  readonly value: number;
}

export interface CanonicalStockReceiptAmounts {
  readonly quantity: CanonicalDecimal;
  readonly unitCost: CanonicalDecimal;
  readonly value: CanonicalDecimal;
}

const bigZero = BigInt(0);
const bigOne = BigInt(1);
const bigTwo = BigInt(2);
const bigTen = BigInt(10);

function powerOfTen(exponent: number) {
  return bigTen ** BigInt(exponent);
}

function decimalFromScaled(scaled: bigint, scale: number): CanonicalDecimal {
  const negative = scaled < bigZero;
  const digits = (negative ? -scaled : scaled)
    .toString()
    .padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : `.${digits.slice(-scale)}`;
  const text = `${negative ? "-" : ""}${whole}${fraction}`;

  return Object.freeze({
    scale,
    scaled,
    text,
    value: Number(text),
  });
}

function roundScaledInteger(
  scaled: bigint,
  sourceScale: number,
  targetScale: number,
) {
  if (targetScale >= sourceScale) {
    return scaled * powerOfTen(targetScale - sourceScale);
  }

  const divisor = powerOfTen(sourceScale - targetScale);
  const negative = scaled < bigZero;
  const magnitude = negative ? -scaled : scaled;
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  const rounded =
    quotient + (remainder * bigTwo >= divisor ? bigOne : bigZero);

  return negative ? -rounded : rounded;
}

/**
 * Rounds the canonical decimal representation of a finite JavaScript number
 * with the same half-away-from-zero rule as PostgreSQL round(numeric, scale).
 * JSON.stringify uses the same shortest round-trippable decimal representation
 * that Number#toString exposes, including exponent notation.
 */
export function canonicalizeDecimal(
  value: number,
  scale: number,
): CanonicalDecimal {
  if (!Number.isFinite(value) || !Number.isInteger(scale) || scale < 0) {
    throw new RangeError("A finite decimal and a non-negative integer scale are required.");
  }

  const serialized = value.toString().toLowerCase();
  const match = serialized.match(
    /^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/,
  );

  if (!match) {
    throw new RangeError("The decimal cannot be canonicalized.");
  }

  const [, sign, whole, fraction = "", exponentText = "0"] = match;
  const coefficient = BigInt(`${whole}${fraction}`);
  const exponent = Number(exponentText);
  const shift = exponent - fraction.length + scale;
  const magnitude =
    shift >= 0
      ? coefficient * powerOfTen(shift)
      : roundScaledInteger(coefficient, -shift, 0);
  const scaled =
    sign === "-" && magnitude !== bigZero ? -magnitude : magnitude;

  return decimalFromScaled(scaled, scale);
}

export function canonicalizeStockReceiptAmounts(
  quantity: number,
  unitCost: number,
): CanonicalStockReceiptAmounts {
  const canonicalQuantity = canonicalizeDecimal(quantity, 4);
  const canonicalUnitCost = canonicalizeDecimal(unitCost, 2);
  const valueScaled = roundScaledInteger(
    canonicalQuantity.scaled * canonicalUnitCost.scaled,
    canonicalQuantity.scale + canonicalUnitCost.scale,
    2,
  );

  return Object.freeze({
    quantity: canonicalQuantity,
    unitCost: canonicalUnitCost,
    value: decimalFromScaled(valueScaled, 2),
  });
}
