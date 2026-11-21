import test from "node:test";
import assert from "node:assert/strict";
import { allocatePower } from "../src/lib/allocation.mjs";

test("allocates requested power when station capacity is available", () => {
  assert.deepEqual(allocatePower({ capacityKw: 100, activeLoadsKw: 20, requestedKw: 30 }), {
    accepted: true, availableKw: 80, allocatedKw: 30,
  });
});

test("caps allocation at remaining station-wide capacity", () => {
  assert.deepEqual(allocatePower({ capacityKw: 100, activeLoadsKw: 86, requestedKw: 30 }), {
    accepted: true, availableKw: 14, allocatedKw: 14,
  });
});

test("rejects when less than the minimum can be allocated", () => {
  assert.deepEqual(allocatePower({ capacityKw: 100, activeLoadsKw: 99.5, requestedKw: 20 }), {
    accepted: false, availableKw: 0.5, allocatedKw: 0,
  });
});

test("rejects invalid numeric inputs", () => {
  assert.throws(() => allocatePower({ capacityKw: -1, activeLoadsKw: 0, requestedKw: 5 }), /capacityKw/);
});
