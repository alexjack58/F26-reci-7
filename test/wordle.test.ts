import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { matchGuess } from '../src/wordle';

// Recitation Part 1: follow along with your TA, filling in the todos below.
// Problem set Task 1: keep adding properties until `npm run mutants:wordle`
// kills every mutant. Read the spec in src/wordle/matchGuess.ts.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The result always has exactly five colors.
// (invariant, algebraic, metamorphic, differential, or conditional)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Step 1: a generator for five-letter uppercase words.
const letter = fc.constantFrom(...ALPHABET.split(''));
const word: fc.Arbitrary<string> = fc.string({ unit: letter, minLength: 5, maxLength: 5 });


// Step 2: two invariants.

describe('matchGuess', () => {
  // Pattern: invariant. The result always has exactly five colors.
  it('returns exactly five colors', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        expect(matchGuess(secret, guess)).toHaveLength(5);
      }),
    );
  });

  // Pattern: invariant. Every color is one of G, Y, or B.
  it('only uses the colors G, Y, B', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        for (const c of matchGuess(secret, guess)) {
          expect(['G', 'Y', 'B']).toContain(c);
        }
      }),
    );
  });

  // Step 3: a conditional property.

  // Pattern: conditional. When guess equals secret, every position is green.
  it('guessing the secret gives all greens', () => {
    fc.assert(
      fc.property(word, w => {
        expect(matchGuess(w, w)).toEqual(['G', 'G', 'G', 'G', 'G']);
      }),
    );
  });

  // Step 4: the duplicate-letter invariant.

  // Pattern: invariant. No letter is credited (G or Y) more times than the
  // secret contains it.
  it('does not credit letters more than they appear in the secret', () => {
    fc.assert(
      fc.property(word, word, (secret, guess) => {
        const result = matchGuess(secret, guess);
        const secretCounts: Record<string, number> = {};
        for (const c of secret) {
          secretCounts[c] = (secretCounts[c] || 0) + 1;
        }
        const guessCounts: Record<string, number> = {};
        for (let i = 0; i < guess.length; i++) {
          if (result[i] === 'G' || result[i] === 'Y') {
            const letter = guess[i];
            guessCounts[letter] = (guessCounts[letter] || 0) + 1;
            expect(guessCounts[letter]).toBeLessThanOrEqual(secretCounts[letter] || 0);
          }
        }
      }),
    );
  });
});
