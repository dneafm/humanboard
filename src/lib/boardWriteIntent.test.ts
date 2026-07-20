import assert from 'node:assert/strict';
import test from 'node:test';
import { detectBoardWriteIntent } from './boardWriteIntent.ts';

test('returns true for the original strict phrasing', () => {
  assert.equal(detectBoardWriteIntent('Save this as a note'), true);
  assert.equal(detectBoardWriteIntent('Add a fusion'), true);
  assert.equal(detectBoardWriteIntent('Edit my fusion'), true);
  assert.equal(detectBoardWriteIntent('Mark this as Ready'), true);
  assert.equal(detectBoardWriteIntent('Write a post about X'), true);
});

test('returns true for natural phrasings the old regex missed (the live bug)', () => {
  // The exact message the user sent that produced the gate-blocked event.
  assert.equal(
    detectBoardWriteIntent("you're tracing the bug. Let me attempt the update again with a minimal body to help isolate the issue."),
    true,
  );
  assert.equal(detectBoardWriteIntent('add a body'), true);
  assert.equal(detectBoardWriteIntent('update the body'), true);
  assert.equal(detectBoardWriteIntent('change the title to Y'), true);
  assert.equal(detectBoardWriteIntent('fix the conclusion'), true);
  assert.equal(detectBoardWriteIntent('please try again with a shorter body'), true);
  assert.equal(detectBoardWriteIntent('generate a thesis draft'), true);
  assert.equal(detectBoardWriteIntent('make a new fusion'), true);
  assert.equal(detectBoardWriteIntent('post the body of the fusion'), true);
  // The follow-up "actually do it" follow-ups — user telling the bot
  // to invoke the toolcall mechanism explicitly.
  assert.equal(detectBoardWriteIntent('call the tool'), true);
  assert.equal(detectBoardWriteIntent('use the tool'), true);
  assert.equal(detectBoardWriteIntent('use the toolcall'), true);
  assert.equal(detectBoardWriteIntent('do it'), true);
  assert.equal(detectBoardWriteIntent('do that'), true);
  assert.equal(detectBoardWriteIntent('fix it'), true);
  assert.equal(detectBoardWriteIntent('try again'), true);
  assert.equal(detectBoardWriteIntent('go'), true);
  assert.equal(detectBoardWriteIntent('proceed'), true);
});

test('returns false for empty / null / undefined', () => {
  assert.equal(detectBoardWriteIntent(''), false);
  assert.equal(detectBoardWriteIntent(null), false);
  assert.equal(detectBoardWriteIntent(undefined), false);
});

test('returns false for pure question / discussion phrasing', () => {
  assert.equal(detectBoardWriteIntent("what's in the vault?"), false);
  assert.equal(detectBoardWriteIntent('summarize my notes'), false);
  // "what if I update the fusion" — "update" is in the message but the
  // user is thinking out loud, not asking for a write. We accept this
  // false positive because the cost of wrongly creating a fusion is
  // much lower than the cost of the user thinking the bot is broken.
  // (The previous gate would have blocked this — and that was the bug.)
  assert.equal(detectBoardWriteIntent('what if I update the fusion later'), true);
});

test('strong negation overrides the verb', () => {
  // User explicitly negates → no write.
  assert.equal(detectBoardWriteIntent("don't update the fusion yet"), false);
  assert.equal(detectBoardWriteIntent("do not save this as a note"), false);
  assert.equal(detectBoardWriteIntent("never delete the project"), false);
  assert.equal(detectBoardWriteIntent("let's discuss before we update"), false);
  assert.equal(detectBoardWriteIntent('not yet — just thinking about it'), false);
  assert.equal(detectBoardWriteIntent('just wondering if I should update'), false);
  // "I don't want to X"
  assert.equal(detectBoardWriteIntent("I don't want to update this"), false);
  // "I don't X" where X is the action verb
  assert.equal(detectBoardWriteIntent("I don't update the fusion"), false);
  assert.equal(detectBoardWriteIntent("never update this"), false);
});

test('state-of-being "don\'t have / don\'t know" does NOT block a later write verb', () => {
  // The live bug. "I don't have the content yet, just put a placeholder"
  // was blocked because my old regex matched "don't" anywhere. The user
  // is using "don't" to describe their state, not to negate the write.
  // The second clause "just put a placeholder" is the actual request.
  assert.equal(
    detectBoardWriteIntent("I don't have the content yet, just put a placeholder body in the fusion"),
    true,
  );
  assert.equal(
    detectBoardWriteIntent("I don't know the full text, just put a placeholder body"),
    true,
  );
  assert.equal(
    detectBoardWriteIntent("I don't have it yet, just put a placeholder"),
    true,
  );
  assert.equal(
    detectBoardWriteIntent("I don't need the full text, just put a placeholder"),
    true,
  );
  // "don't make me" pattern — "make" is in our verb list, but the
  // user isn't asking us to make something; they're saying "don't make
  // me [do something else]". The second clause is the real ask.
  assert.equal(
    detectBoardWriteIntent("don't make me paste, just put a placeholder body now"),
    true,
  );
  // Direct negations of a write action still block.
  assert.equal(detectBoardWriteIntent("don't update the fusion"), false);
  assert.equal(detectBoardWriteIntent("don't make any changes"), false);
  assert.equal(detectBoardWriteIntent("I don't want to update this"), false);
});
