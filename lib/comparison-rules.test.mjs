import test from "node:test";
import assert from "node:assert/strict";
import {
  parseComparisonBidList,
  selectWinningIds,
  serializeComparisonBidList,
} from "./comparison-rules.ts";

const available = new Set([10, 20, 30, 40]);

test("normaliza BIDs existentes, únicos e limitados a três", () => {
  assert.deepEqual(parseComparisonBidList("10,invalid,20,10,30,40,999", available), [10, 20, 30]);
  assert.deepEqual(parseComparisonBidList(null, available), []);
});

test("serializa no máximo três BIDs", () => {
  assert.equal(serializeComparisonBidList([10, 20, 30, 40]), "10,20,30");
});

test("destaca o maior valor e todos os empates", () => {
  assert.deepEqual(
    [...selectWinningIds("higher", [{ id: 10, value: 4 }, { id: 20, value: 7 }, { id: 30, value: 7 }])],
    [20, 30]
  );
});

test("usa o menor valor em métricas disciplinares", () => {
  assert.deepEqual(
    [...selectWinningIds("lower", [{ id: 10, value: 2 }, { id: 20, value: 0 }, { id: 30, value: 1 }])],
    [20]
  );
});

test("ignora N/A e permite um único valor aplicável vencer", () => {
  assert.deepEqual(
    [...selectWinningIds("higher", [{ id: 10, value: 5 }, { id: 20, value: null }])],
    [10]
  );
  assert.deepEqual(
    [...selectWinningIds("higher", [{ id: 10, value: null }, { id: 20, value: null }])],
    []
  );
});
