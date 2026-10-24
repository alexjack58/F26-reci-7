import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Recitation Part 2 (groups) and problem set Task 2.
// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// Endpoints live in a small range on purpose. Overlapping, nested, touching
// and barely-separated intervals have to show up often, and so do two-digit
// and negative numbers (which sort differently as strings than as numbers).
const MIN = -20;
const MAX = 20;
const MAX_LEN = 8;

// The recitation starter drew two unrelated integers, which produced
// intervals like [0, -1] and violated the precondition start <= end.
// Valid by construction instead: a start and a non-negative length.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: MIN, max: MAX }), fc.nat(MAX_LEN))
  .map(([start, len]): Interval => [start, start + len]);
const intervalList: fc.Arbitrary<Interval[]> = fc.array(interval, { maxLength: 8 });

// Targeted generator for the conditional property: a list that is already
// sorted and whose intervals neither overlap nor touch. Each interval starts
// `gap >= 1` past the previous end. Gap 1 gives pairs like [1, 2], [3, 4],
// which the specification says stay separate (2 < x < 3 is uncovered).
const disjointList: fc.Arbitrary<Interval[]> = fc
  .tuple(
    fc.integer({ min: MIN, max: MAX }),
    fc.array(fc.tuple(fc.integer({ min: 1, max: 6 }), fc.nat(MAX_LEN)), { maxLength: 8 }),
  )
  .map(([first, steps]) => {
    const out: Interval[] = [];
    let start = first;
    for (const [gap, len] of steps) {
      out.push([start, start + len]);
      start = start + len + gap;
    }
    return out;
  });

// A random reordering of a list.
const shuffled = (xs: Interval[]) =>
  fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length });

// Helper oracle: is the real number p covered by some interval in xs?
const covers = (xs: readonly Interval[], p: number) => xs.some(([a, b]) => a <= p && p <= b);

// Points where coverage could change: every endpoint, and the real numbers
// half a unit either side of it (the spec is about all reals, not integers).
const probes = (xs: readonly Interval[]) =>
  xs.flatMap(([a, b]) => [a - 0.5, a, a + 0.5, b - 0.5, b, b + 0.5]);

const deepCopy = (xs: readonly Interval[]): Interval[] => xs.map(([a, b]) => [a, b]);

describe('mergeIntervals', () => {
  // Example tests from the specification, not properties.
  it('matches the examples from the specification', () => {
    expect(mergeIntervals([])).toEqual([]);
    expect(mergeIntervals([[1, 3], [3, 5]])).toEqual([[1, 5]]);
    expect(mergeIntervals([[1, 2], [3, 4]])).toEqual([[1, 2], [3, 4]]);
  });

  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. The output is a list of valid intervals, sorted by
  // start, and consecutive intervals neither overlap nor touch:
  // result[i][1] < result[i + 1][0].
  it('returns valid, sorted, non-overlapping, non-touching intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const [a, b] of out) {
          expect(Number.isInteger(a) && Number.isInteger(b) && a <= b).toBe(true);
        }
        for (let i = 0; i + 1 < out.length; i++) {
          expect(out[i][1]).toBeLessThan(out[i + 1][0]);
        }
      }),
    );
  });

  // Pattern: invariant. Neither the input array nor the intervals in it are
  // modified.
  it('does not modify the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const before = deepCopy(xs);
        mergeIntervals(xs);
        expect(xs).toEqual(before);
      }),
    );
  });

  // Pattern: differential. A tiny coverage oracle agrees on input and output:
  // every probe point is covered by the output exactly when the input covers it.
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const p of [...probes(xs), ...probes(out)]) {
          expect(covers(out, p)).toBe(covers(xs, p));
        }
      }),
    );
  });

  // Pattern: metamorphic. Reordering the input does not change the output.
  it('gives the same output for any ordering of the input', () => {
    fc.assert(
      fc.property(
        intervalList.chain(xs => fc.tuple(fc.constant(xs), shuffled(xs))),
        ([xs, ys]) => {
          expect(mergeIntervals(ys)).toEqual(mergeIntervals(xs));
        },
      ),
    );
  });

  // Pattern: metamorphic. Appending a duplicate of an interval already in the
  // input does not change the output.
  it('ignores duplicate intervals', () => {
    fc.assert(
      fc.property(intervalList, fc.nat(7), (xs, i) => {
        const extra = xs.length === 0 ? [] : [xs[i % xs.length]];
        expect(mergeIntervals([...xs, ...extra])).toEqual(mergeIntervals(xs));
      }),
    );
  });

  // Pattern: algebraic. Merging is idempotent: merging an already merged list
  // gives it back unchanged.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: algebraic. Merging distributes over concatenation: merging two
  // lists together equals merging the two merged results together.
  it('merges a concatenation the same as the concatenation of merges', () => {
    fc.assert(
      fc.property(intervalList, intervalList, (xs, ys) => {
        const together = mergeIntervals([...xs, ...ys]);
        const separately = mergeIntervals([...mergeIntervals(xs), ...mergeIntervals(ys)]);
        expect(separately).toEqual(together);
      }),
    );
  });

  // Pattern: conditional. If the input intervals already neither overlap nor
  // touch, the output is exactly the input, sorted by start.
  it('returns an already-disjoint input unchanged, sorted by start', () => {
    fc.assert(
      fc.property(
        disjointList.chain(xs => fc.tuple(fc.constant(xs), shuffled(xs))),
        ([sorted, anyOrder]) => {
          expect(mergeIntervals(anyOrder)).toEqual(sorted);
        },
      ),
    );
  });
});
