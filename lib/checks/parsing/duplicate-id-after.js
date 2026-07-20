function duplicateIdAfter(results) {
  const uniqueIds = [];
  return results.filter(r => {
    const id = r.data && typeof r.data === 'object' ? r.data.id : r.data;
    if (uniqueIds.indexOf(id) === -1) {
      uniqueIds.push(id);
      return true;
    }
    return false;
  });
}

export default duplicateIdAfter;
