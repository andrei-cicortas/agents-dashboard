// What the find bar says about where you are in the matches.
//
// Pure, so the wording is decided in one place and tested without a terminal:
// the search addon reports an index and a count, and both can be missing while
// it is still looking.

export function matchLabel({ term = '', resultIndex = -1, resultCount = 0 } = {}) {
  if (!term) return '';
  if (!resultCount) return 'No matches';
  // The addon counts from zero, and reports -1 until it has settled on one.
  const at = resultIndex >= 0 ? resultIndex + 1 : 1;
  return `${at} of ${resultCount}`;
}
