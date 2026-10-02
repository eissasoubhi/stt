import assert from "node:assert/strict";
import test from "node:test";

import { nllbLanguageCode } from "../src/translation/nllb.js";

test("maps Moroccan Darija to NLLB Moroccan Arabic", () => {
  assert.equal(nllbLanguageCode("ar-MA"), "ary_Arab");
});

test("maps Egyptian Arabic to NLLB Egyptian Arabic", () => {
  assert.equal(nllbLanguageCode("ar-EG"), "arz_Arab");
});

test("maps standard languages used by the extension", () => {
  assert.equal(nllbLanguageCode("ar"), "arb_Arab");
  assert.equal(nllbLanguageCode("fr"), "fra_Latn");
  assert.equal(nllbLanguageCode("en"), "eng_Latn");
});

test("does not pretend to auto-detect a source dialect", () => {
  assert.equal(nllbLanguageCode("auto"), null);
});
