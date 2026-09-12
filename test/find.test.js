import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLabel } from '../shared/find.js';

test('with nothing typed there is nothing to say', () => {
  assert.equal(matchLabel({ term: '', resultCount: 0 }), '');
  assert.equal(matchLabel(), '');
});

test('a word that is not there says so', () => {
  assert.equal(matchLabel({ term: 'nope', resultIndex: -1, resultCount: 0 }), 'No matches');
});

test('matches are counted from one, the way a person counts', () => {
  assert.equal(matchLabel({ term: 'a', resultIndex: 0, resultCount: 3 }), '1 of 3');
  assert.equal(matchLabel({ term: 'a', resultIndex: 2, resultCount: 3 }), '3 of 3');
});

test('before it has settled on one, it still says how many there are', () => {
  assert.equal(matchLabel({ term: 'a', resultIndex: -1, resultCount: 4 }), '1 of 4');
});
