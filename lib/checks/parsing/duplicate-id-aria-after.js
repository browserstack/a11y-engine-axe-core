/**
 * Mirrors `duplicate-id-after`, but dedupes by `r.data.id` since the aria
 * evaluate stores its data as an object (`{ id, reviewPayload }`) rather than
 * a bare id string.
 */
function duplicateIdAriaAfter(results) {
  const uniqueIds = [];
  return results.filter(r => {
    const id = r.data && r.data.id;
    if (uniqueIds.indexOf(id) === -1) {
      uniqueIds.push(id);
      return true;
    }
    return false;
  });
}

export default duplicateIdAriaAfter;
