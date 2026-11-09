/**
 * The double `value` as Java's `Double.toString` writes it: with no exponent from 10^-3 up to 10^7, a point and a digit
 * after it at least, and else as `1.0E7`, `1.2E-4`, from the shortest decimal that reads back as it.
 */
export function javaDouble(value: number): string {
    if (Number.isNaN(value)) {
        return 'NaN';
    }
    if (!Number.isFinite(value)) {
        return value > 0 ? 'Infinity' : '-Infinity';
    }
    if (value === 0) {
        return Object.is(value, -0) ? '-0.0' : '0.0';
    }
    const magnitude = Math.abs(value);
    if (magnitude >= 1e-3 && magnitude < 1e7) {
        const text = String(value);
        return text.includes('.') ? text : `${text}.0`;
    }
    // Two digits at least, as Java writes them: the least double, 5e-324, is 4.9E-324.
    const [shortest] = value.toExponential().split('e');
    const [mantissa, exponent] = (shortest.includes('.') ? value.toExponential() : value.toExponential(1)).split('e');
    return `${mantissa}E${Number(exponent)}`;
}
