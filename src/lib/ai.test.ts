import assert from 'node:assert/strict';
import test from 'node:test';
import { detectTruncatedToolcall } from './aiTruncation.ts';

test('detectTruncatedToolcall returns null for empty input', () => {
  assert.equal(detectTruncatedToolcall(''), null);
});

test('detectTruncatedToolcall returns null when no toolcalls present', () => {
  assert.equal(detectTruncatedToolcall('just a regular response with no toolcalls'), null);
});

test('detectTruncatedToolcall returns null when all toolcalls are properly closed', () => {
  const text = `Some prose
<toolcall_create_fusion>
{"title": "Foo"}
</toolcall_create_fusion>
more prose
<toolcall_update_fusion>
{"target": "Foo"}
</toolcall_update_fusion>`;
  assert.equal(detectTruncatedToolcall(text), null);
});

test('detectTruncatedToolcall flags an unclosed create_fusion tag', () => {
  // The classic failure mode: the body was so large that the model hit its
  // max output token limit and the closing </toolcall_create_fusion> was
  // never emitted. The chatbot relies on this detector to surface a clear
  // error instead of silently dropping the call.
  const text = `Here's the fusion you asked for:
<toolcall_create_fusion>
{"title": "Abstract Control Protocol", "body": "very long...`;
  assert.equal(detectTruncatedToolcall(text), 'create_fusion');
});

test('detectTruncatedToolcall flags an unclosed update_fusion tag', () => {
  const text = `<toolcall_update_fusion>
{"target": "Foo", "updates": {"body": "huge body`;
  assert.equal(detectTruncatedToolcall(text), 'update_fusion');
});

test('detectTruncatedToolcall ignores mismatched close tags', () => {
  // A create_fusion tag was closed by a stray update_fusion close tag.
  // The first unclosed open tag wins.
  const text = `<toolcall_create_fusion>
{"title": "Foo"}
</toolcall_update_fusion>`;
  assert.equal(detectTruncatedToolcall(text), 'create_fusion');
});
