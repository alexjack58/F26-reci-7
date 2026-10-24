# Reflection

**Name / Andrew ID:** Alex Jackson / alexjack

**Recitation group members (Task 2):**

---

### 1. Valid but weak

Pick a property you wrote that passes on the correct implementation but
kills few or no mutants. Why is it still a *valid* property? Describe a
concrete bug (not one of our mutants) that it *would* catch.

The relabeling property in my Wordle tests ("is unchanged by relabeling the alphabet"). I generate a random permutation of the 26 letters, apply it to both the secret and the guess, and check that the colors come out the same. It killed zero mutants. All five mutants treat every letter the same way, so renaming letters doesn't change what any of them output.

It's still valid because nothing in the spec cares what the letters actually are. It only ever asks whether guess[i] equals secret[i], or whether a letter shows up somewhere else in the secret. So swapping A for Q everywhere can't change the result.

A bug it would catch: say someone keeps letter counts in an array indexed by charCode - 65 and makes the array 25 long instead of 26, or writes charCode - 64 by mistake. Then Z (or A) falls off the end of the array, its count is always undefined, and that letter never gets a yellow. Any run where the permutation maps a yellow letter onto Z would fail this property.

### 2. A generator problem, not a property problem

Describe a mutant, from either task, that survived or was flaky because of
your **generator** rather than your property. What did the generator fail to
produce? How did you fix it? Paste the runner output from before and after.

The singlePass mutant in Wordle. It does everything in one left to right pass, so an early yellow can eat the only copy of a letter that a later green needed. The property from recitation ("does not credit letters more than they appear in the secret") already checks for exactly this. The problem was the generator, which was just word, word over all 26 letters. For the bug to show up you need a guess with the same letter twice, where the first one isn't green, the second one is, and the secret only has one copy of it. Two random 26-letter words almost never line up like that. So the property was checking the right thing, it just barely ever got an input that triggered it.

Before, with word, word (5 runs):

```
  ~ singlePass     flaky: killed in 2/5 runs  by: does not credit letters more than they appear in the secret
      Counterexample: ["AAAAK","AKAAK"]
      AssertionError: expected 2 to be less than or equal to 1
```

The fix was a wordPair generator that is an fc.oneof of two things: a pair of words over the full alphabet, and a pair of words over just A, B and C. With three letters every word is full of repeats, so the yellow-then-green case shows up pretty much every run. Both words in a pair come from the same alphabet, otherwise they would barely share any letters.

After (npm run mutants:wordle -- --repeat 10):

```
  ✔ singlePass     killed  by: does not credit letters more than they appear in the secret; credits each letter min(count in guess, count in secret) times; swapping secret and guess preserves the green and non-black counts
      Counterexample: [["AACAA","ACCAA"]]
      AssertionError: expected 2 to be less than or equal to 1
```

### 3. Reading a counterexample

Paste one counterexample that the mutation runner printed for a killed
mutant. In 2–3 sentences, explain using the *specification* why that input
exposes the bug.

```
  ✔ singlePass     killed  by: does not credit letters more than they appear in the secret; ...
      Counterexample: [["AACAA","ACCAA"]]
      AssertionError: expected 2 to be less than or equal to 1
```

Secret AACAA, guess ACCAA. The spec decides greens first by position, so the C at position 2 of the guess is green and uses up the only C in the secret, which leaves the C at position 1 with no unused C to claim, so it has to be black (G B G G G). The mutant goes left to right instead, hands position 1 a yellow while it still thinks a C is free, then gives position 2 its green anyway, so C gets credited twice when the secret only has one, which is the "expected 2 to be less than or equal to 1" in the assertion.

### 4. Your project

Name one function or module in your team's project that would benefit from
property-based testing. State two properties in English, name the pattern of
each, and describe the generator you'd need, including anything about its
inputs that a naive generator would get wrong.

The /orient command I added to our OpenCode fork (packages/opencode/src/command/index.ts and src/command/template/orient.txt). The command is mostly a prompt template with two placeholders. ${path} gets filled with the current worktree when the template is read, and $ARGUMENTS gets filled with whatever the user typed after /orient (like "/orient the build system") when the command runs, in SessionPrompt.command. The thing worth property testing is that rendering step: template, worktree path and focus text go in, the prompt that gets sent to the model comes out. Right now my tests for it are just examples with one fixed template and an empty focus.

Property 1 (invariant): for any worktree path and any focus text, the rendered prompt contains the path, has no leftover ${path} or $ARGUMENTS in it, and every line of the template that didn't have a placeholder is still there word for word. Filling in the blanks shouldn't mess with the instructions around them.

Property 2 (conditional): if the focus text isn't blank, it shows up in the prompt exactly as typed. If it is blank (empty or only whitespace), the prompt is just the template with the path filled in and nothing else added. That's the "honor it if present, ignore if blank" rule the template itself states. This one would actually catch a real bug. $ARGUMENTS is substituted with String.replaceAll and a plain string, and JavaScript treats dollar patterns in a replacement string specially. I tried it in node: a focus of "price is $$5" comes out as "price is $5", and "cost in $& dollars" comes out as "cost in $ARGUMENTS dollars". So the user's text doesn't always arrive the way they typed it.

For the generator I'd need two targeted ones.

For worktree paths: a leading / and then 1 to 6 segments joined with /, each segment made of letters, digits, dots, dashes and spaces, with some segments that include a $. A plain fc.string() gives empty strings, control characters and no slashes, so it doesn't look like a path at all.

For the focus text: an fc.oneof of three cases. Blank strings built only from spaces, tabs and newlines, so the blank branch gets hit on purpose instead of by luck. Normal words and quoted phrases. And strings that deliberately contain $, $$, $&, $1, quotes and backticks. A naive string generator almost never puts two dollar signs next to each other or a dollar sign right before an ampersand, so property 2 would pass on the buggy code every single run, the same way the 26-letter generator kept missing singlePass today.
