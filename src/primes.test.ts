import { expect, it } from 'vitest';
import { flattenPrimes } from './primes';
it('aligns repeated derivative primes and preserves powers', () => {
  expect(flattenPrimes('f^{\\prime}^{\\prime}^{\\prime}(x)')).toBe('f^{\\prime\\prime\\prime}(x)');
  expect(flattenPrimes('x^2+f^{\\prime}(x)')).toBe('x^2+f^{\\prime}(x)');
});
