import test from "node:test";
import assert from "node:assert/strict";
import { crestWebpQualityCandidates, detectCrestSourceType, isValidProcessedCrest, matchesDeclaredCrestType } from "./club-crest.ts";

test("detecta assinaturas reais de PNG, JPEG e WebP", () => {
  assert.equal(detectCrestSourceType(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), "png");
  assert.equal(detectCrestSourceType(Uint8Array.from([0xff,0xd8,0xff,0xe0])), "jpeg");
  assert.equal(detectCrestSourceType(Uint8Array.from([82,73,70,70,0,0,0,0,87,69,66,80])), "webp");
  assert.equal(detectCrestSourceType(Uint8Array.from([60,115,118,103,62])), null);
});

test("recusa MIME incompatível com o conteúdo", () => {
  const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  assert.equal(matchesDeclaredCrestType(png, "image/png"), true);
  assert.equal(matchesDeclaredCrestType(png, "image/jpeg"), false);
});

test("define tentativas decrescentes e valida o resultado final", () => {
  assert.deepEqual(crestWebpQualityCandidates(), [82, 74, 66, 58, 50, 42]);
  assert.equal(isValidProcessedCrest({ width: 120, height: 100, size: 50 * 1024, format: "webp" }), true);
  assert.equal(isValidProcessedCrest({ width: 121, height: 100, size: 1000, format: "webp" }), false);
  assert.equal(isValidProcessedCrest({ width: 120, height: 120, size: 50 * 1024 + 1, format: "webp" }), false);
});
