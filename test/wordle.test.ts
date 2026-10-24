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
const LETTERS = ALPHABET.split('');

// Step 1: a generator for five-letter uppercase words.
const letter = fc.constantFrom(...LETTERS);
const word: fc.Arbitrary<string> = fc.string({ unit: letter, minLength: 5, maxLength: 5 });

// Two kinds of word pairs, because each alphabet hides something:
//  - Over the full alphabet, most letters are distinct and most guess letters
//    are absent from the secret. Bugs about repeated letters rarely show up.
//  - Over a 3-letter alphabet, nearly every letter repeats and nearly every
//    guess letter is present in the secret. Bugs about absent letters never
//    show up.
// Both words of a pair use the same alphabet, so they actually share letters.
const smallWord: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom('A', 'B', 'C'),
  minLength: 5,
  maxLength: 5,
});
const wordPair: fc.Arbitrary<[string, string]> = fc.oneof(
  fc.tuple(word, word),
  fc.tuple(smallWord, smallWord),
);

// Targeted generator: a guess that is a rearrangement of the secret's letters.
const anagramPair: fc.Arbitrary<[string, string]> = word.chain(secret =>
  fc
    .shuffledSubarray([...secret], { minLength: 5, maxLength: 5 })
    .map((letters): [string, string] => [secret, letters.join('')]),
);

// Targeted generator: a guess built only from letters the secret does not
// contain (the alphabet with the secret's letters removed).
const disjointPair: fc.Arbitrary<[string, string]> = word.chain(secret => {
  const absent = ALPHABET.replace(new RegExp(`[${secret}]`, 'g'), '').split('');
  const guess = fc.string({ unit: fc.constantFrom(...absent), minLength: 5, maxLength: 5 });
  return fc.tuple(fc.constant(secret), guess);
});

// A relabeling of the alphabet (a bijection on letters) as a function on words.
const relabeling: fc.Arbitrary<(w: string) => string> = fc
  .shuffledSubarray(LETTERS, { minLength: 26, maxLength: 26 })
  .map(perm => (w: string) => [...w].map(c => perm[ALPHABET.indexOf(c)]).join(''));

// Helper oracle: how many times does letter `c` occur in `s`?
const count = (s: string, c: string) => s.split(c).length - 1;

// Step 2: two invariants.

describe('matchGuess', () => {
  // Example test from the specification, not a property.
  it('matches the example from the specification', () => {
    expect(matchGuess('APPLE', 'ALLEY')).toEqual(['G', 'Y', 'B', 'Y', 'B']);
  });

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

  // In recitation this used `word, word` and killed singlePass only sometimes:
  // with 26 letters, a guess rarely has the same letter yellow early and green
  // later. `wordPair` mixes in 3-letter words, where that happens constantly.

  // Pattern: invariant. No letter is credited (G or Y) more times than the
  // secret contains it.
  it('does not credit letters more than they appear in the secret', () => {
    fc.assert(
      fc.property(wordPair, ([secret, guess]) => {
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

  // Problem set Task 1.

  // Pattern: invariant. A position is green exactly when the guess and the
  // secret have the same letter there.
  it('is green exactly where the letters agree', () => {
    fc.assert(
      fc.property(wordPair, ([secret, guess]) => {
        const result = matchGuess(secret, guess);
        for (let i = 0; i < 5; i++) {
          expect(result[i] === 'G').toBe(guess[i] === secret[i]);
        }
      }),
    );
  });

  // Greens use matching positions, then yellows use up whatever occurrences
  // the secret has left, so the total credited can never exceed either count.

  // Pattern: invariant. For every letter, the number of credited positions
  // (G or Y) equals the smaller of its counts in the guess and in the secret.
  it('credits each letter min(count in guess, count in secret) times', () => {
    fc.assert(
      fc.property(wordPair, ([secret, guess]) => {
        const result = matchGuess(secret, guess);
        for (const c of new Set(guess)) {
          let credited = 0;
          for (let i = 0; i < 5; i++) {
            if (guess[i] === c && result[i] !== 'B') credited++;
          }
          expect(credited).toBe(Math.min(count(guess, c), count(secret, c)));
        }
      }),
    );
  });

  // Pattern: conditional. When the guess is a rearrangement of the secret's
  // letters, no position is black: every letter has an occurrence to claim.
  it('an anagram of the secret has no blacks', () => {
    fc.assert(
      fc.property(anagramPair, ([secret, guess]) => {
        expect(matchGuess(secret, guess)).not.toContain('B');
      }),
    );
  });

  // Pattern: conditional. When no letter of the guess occurs in the secret,
  // every position is black.
  it('a guess sharing no letters with the secret is all black', () => {
    fc.assert(
      fc.property(disjointPair, ([secret, guess]) => {
        expect(matchGuess(secret, guess)).toEqual(['B', 'B', 'B', 'B', 'B']);
      }),
    );
  });

  // Pattern: metamorphic. Renaming letters consistently in both words (any
  // bijection on the alphabet) leaves the colors unchanged, because the
  // specification only ever compares letters for equality.
  it('is unchanged by relabeling the alphabet', () => {
    fc.assert(
      fc.property(wordPair, relabeling, ([secret, guess], rename) => {
        expect(matchGuess(rename(secret), rename(guess))).toEqual(matchGuess(secret, guess));
      }),
    );
  });

  // Pattern: metamorphic. Swapping secret and guess keeps the number of greens
  // and the number of credited (non-black) positions, since both depend only
  // on the shared letters of the two words.
  it('swapping secret and guess preserves the green and non-black counts', () => {
    fc.assert(
      fc.property(wordPair, ([secret, guess]) => {
        const forward = matchGuess(secret, guess);
        const backward = matchGuess(guess, secret);
        const tally = (colors: string[]) => ({
          greens: colors.filter(c => c === 'G').length,
          credited: colors.filter(c => c !== 'B').length,
        });
        expect(tally(backward)).toEqual(tally(forward));
      }),
    );
  });
});
