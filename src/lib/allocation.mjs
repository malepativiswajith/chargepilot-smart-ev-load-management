/**
 * Pure allocation policy. Call only after locking the station row in a
 * transaction; station serialization is what makes concurrent decisions safe.
 */
export function allocatePower({ capacityKw, activeLoadsKw, requestedKw, minimumKw = 1 }) {
  for (const [name, value] of Object.entries({ capacityKw, activeLoadsKw, requestedKw, minimumKw })) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  }
  const availableKw = Math.max(0, capacityKw - activeLoadsKw);
  if (availableKw < minimumKw) return { accepted: false, availableKw, allocatedKw: 0 };
  const allocatedKw = Math.min(requestedKw, availableKw);
  return { accepted: allocatedKw >= minimumKw, availableKw, allocatedKw: allocatedKw >= minimumKw ? allocatedKw : 0 };
}
