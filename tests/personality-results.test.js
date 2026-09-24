import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
    EXAMPLE_SCORES, MUPPET_CHARACTERS, MUPPET_QUESTIONS, profileFromResponses, profileFromScores
} from "../js/muppet-profile.js";
import {
    buildMatchExplanation, createResultUrl, decodeResult, encodeResult,
    hydrateSharedResult, normalizeResult, runSelfTests
} from "../js/results-view.js";
import { resolveResultRoute } from "../js/results-page.js";
import { UHCI_DIMENSIONS } from "../js/quiz-engine.js";

const catalog = MUPPET_CHARACTERS.map((character) => ({
    ...character, dimensions: character.scores
}));
const pack = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const result = profileFromScores(EXAMPLE_SCORES);

test("production roster preserves the original 15 baselines and one Statler/Waldorf duo", () => {
    const original = {
        kermit: [9, 8, 9, 3, 6, 8],
        "miss-piggy": [9, 2, 5, 4, 7, 4],
        fozzie: [7, 3, 8, 5, 6, 4],
        gonzo: [8, 4, 6, 9, 7, 5],
        animal: [7, 1, 4, 6, 5, 2],
        rowlf: [6, 8, 8, 3, 5, 8],
        scooter: [8, 9, 8, 2, 4, 9],
        "statler-waldorf": [6, 7, 3, 4, 8, 7],
        "swedish-chef": [6, 3, 5, 8, 7, 4],
        beaker: [4, 2, 7, 4, 4, 3],
        "sam-eagle": [8, 9, 4, 2, 5, 9],
        rizzo: [7, 4, 5, 5, 7, 5],
        pepe: [8, 3, 4, 6, 7, 4],
        bunsen: [7, 9, 6, 3, 4, 8],
        walter: [6, 7, 9, 3, 4, 8]
    };
    assert.deepEqual(Object.fromEntries(MUPPET_CHARACTERS.map(({ id, scores }) => [
        id, UHCI_DIMENSIONS.map((dimension) => scores[dimension])
    ])), original);
    assert.equal(MUPPET_CHARACTERS.find(({ id }) => id === "statler-waldorf").name, "Statler & Waldorf");
    for (const character of MUPPET_CHARACTERS) {
        assert.equal(typeof character.description, "string");
        assert.ok(character.description.length > 20);
        assert.equal(profileFromScores(character.scores).matches[0].id, character.id);
        assert.equal(profileFromScores(character.scores).matches[0].score, 100);
    }
});

test("full questionnaire adapter preserves primary blocks and reverse scoring", () => {
    const reverse = new Set([6, 8, 10, 14, 16, 18, 23, 28, 29]);
    assert.equal(MUPPET_QUESTIONS.length, 30);
    const values = [1, 3, 5, 7, 10];
    for (let sample = 0; sample < 100; sample++) {
        const responses = Object.fromEntries(MUPPET_QUESTIONS.map(({ id }, index) => [
            id, values[(sample * (index + 3) + Math.floor(sample / 5) + index * index) % 5]
        ]));
        const expected = Object.fromEntries(UHCI_DIMENSIONS.map((dimension, block) => [
            dimension,
            Array.from({ length: 5 }, (_, index) => {
                const number = block * 5 + index + 1;
                return reverse.has(number) ? 11 - responses[`q${number}`] : responses[`q${number}`];
            }).reduce((sum, value) => sum + value, 0) / 5
        ]));
        assert.deepEqual(profileFromResponses(responses).dimensions, expected);
    }
    assert.throws(() => profileFromResponses({ q1: 7 }), /incomplete or invalid/);
    assert.throws(() => profileFromScores({ ...EXAMPLE_SCORES, ED: 11 }), /1 to 10/);
});

test("scores retain full precision and do not reorder matches before rounding", () => {
    const scores = { ED: 3.25, EC: 7.75, SA: 5.5, RL: 4.15, SH: 8.05, BS: 6.4 };
    const profile = profileFromScores(scores, { mode: "quick" });
    const decoded = decodeResult(encodeResult(profile));
    assert.deepEqual(decoded.d, UHCI_DIMENSIONS.map((id) => scores[id]));
    assert.deepEqual(hydrateSharedResult(decoded, catalog), normalizeResult({
        ...profile, title: "A shared character profile"
    }));
    const shuffled = {
        ...profile,
        matches: profile.matches.slice(0, 3).map((match, index) => ({
            ...match, score: [80.01, 80.03, 80.02][index]
        }))
    };
    assert.deepEqual(normalizeResult(shuffled).matches.map(({ score }) => score), [80.03, 80.02, 80.01]);
});

test("detailed links roundtrip mode, sample provenance, scores, and all computed ranks", () => {
    for (const mode of ["quick", "full"]) {
        for (const example of [true, false]) {
            const input = { ...result, mode, example };
            const payload = decodeResult(encodeResult(input));
            assert.equal(payload.v, 2);
            assert.equal(payload.c, "muppets-1");
            assert.equal(payload.mode, mode);
            assert.equal(payload.example, example);
            assert.equal("m" in payload, false);
            assert.equal("answers" in payload, false);
            const hydrated = hydrateSharedResult(payload, catalog);
            assert.deepEqual(hydrated.dimensions, result.dimensions);
            assert.deepEqual(hydrated.matches, normalizeResult(result).matches);
            assert.equal(hydrated.mode, mode);
            assert.equal(hydrated.example, example);
            assert.equal(encodeResult(input), encodeResult(input));
        }
    }
    assert.equal(runSelfTests(), true);
});

test("legacy links recompute matches from trusted baselines, not supplied percentages", () => {
    const legacy = { v: 1, d: Object.values(EXAMPLE_SCORES), m: [["kermit", 0], ["rowlf", 0], ["scooter", 100]] };
    const hydrated = hydrateSharedResult(decodeResult(pack(legacy)), catalog);
    assert.deepEqual(hydrated.matches, normalizeResult(result).matches);
    assert.equal(hydrated.mode, "full");
    legacy.m[0][0] = "unavailable";
    assert.throws(() => hydrateSharedResult(decodeResult(pack(legacy)), catalog), /unavailable/);
});

test("malformed, non-finite, out-of-range, and unsupported links are rejected", () => {
    const good = decodeResult(encodeResult(result));
    for (const invalid of [
        "", "not valid base64", "x".repeat(2049),
        pack(null), pack({ ...good, v: 999 }),
        pack({ ...good, c: "another-catalog" }),
        pack({ ...good, d: [1, 2] }),
        ...[0, 11, null, "5", Infinity].map((score) => pack({ ...good, d: [score, 2, 3, 4, 5, 6] })),
        pack({ ...good, mode: "clinical" }),
        pack({ ...good, example: "yes" }),
        pack({ v: 1, d: good.d, m: [["kermit", 20], ["kermit", 30], ["rowlf", 40]] })
    ]) {
        assert.throws(() => decodeResult(invalid), TypeError);
    }
    assert.throws(() => normalizeResult({ ...result, dimensions: { ...EXAMPLE_SCORES, ED: NaN } }), TypeError);
    assert.throws(() => normalizeResult({ ...result, mode: "invalid" }), TypeError);
});

test("private result URLs preserve Pages subpaths and clear stale query/hash state", () => {
    const url = new URL(createResultUrl(result, "https://example.test/which-character/muppets.html?example=1#old"));
    assert.equal(url.pathname, "/which-character/results.html");
    assert.equal(url.search, "");
    assert.deepEqual(resolveResultRoute(url.href).result.matches, normalizeResult(result).matches);
});

test("routes explicitly distinguish profiles, examples, both franchises, and empty state", () => {
    const base = "https://example.test/which-character/results.html";
    assert.equal(resolveResultRoute(base).type, "empty");
    assert.equal(resolveResultRoute(`${base}?example=1`).result.example, true);
    assert.equal(resolveResultRoute(base, { allowExample: true }).result.example, true);
    for (const [id, universe] of [["kermit", "muppets"], ["cookie", "sesame-street"], ["elmo", "sesame-street"]]) {
        const route = resolveResultRoute(`${base}?character=${id}`);
        assert.equal(route.type, "character");
        assert.equal(route.character.id, id);
        assert.equal(route.character.universe, universe);
        assert.equal("result" in route, false);
    }
    assert.equal(resolveResultRoute(createResultUrl({ ...result, mode: "quick" }, base)).result.mode, "quick");
});

test("invalid and conflicting routes never fall through to an example", () => {
    const base = "https://example.test/results.html";
    const encoded = encodeResult(result);
    for (const suffix of [
        "?character=missing", "?character=", "?character=kermit&character=gonzo",
        "?example=", "?example=invalid", "?example=1&example=1",
        "?character=kermit&example=1", `?character=kermit#result=${encoded}`,
        `?example=1#result=${encoded}`, "#result=", "#broken",
        `#result=${encoded}&result=${encoded}`, "?result=invalid&example=1",
        "?profile=invalid&example=1"
    ]) {
        assert.throws(() => resolveResultRoute(base + suffix, { allowExample: true }), TypeError, suffix);
    }
});

test("balanced scores are not described as a pronounced trait", () => {
    const balanced = Object.fromEntries(UHCI_DIMENSIONS.map((id) => [id, 5.5]));
    assert.match(buildMatchExplanation(balanced, result.matches[0]), /near the middle/);
    assert.doesNotMatch(buildMatchExplanation(balanced, result.matches[0]), /pronounced/);
});

test("production and legacy example pages load the import-safe page entry", async () => {
    for (const page of ["results.html", "results-prototype.html"]) {
        const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
        assert.match(html, /type="module" src="js\/results-page.js"/);
        assert.match(html, /<noscript>/);
        assert.doesNotMatch(html, /result-fixture/);
    }
});
