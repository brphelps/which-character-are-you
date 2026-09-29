import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
    FREQUENCY_OPTIONS,
    getMuppetQuestions,
    MUPPET_QUESTIONS,
    MUPPET_QUICK_QUESTIONS,
    MUPPET_FULL_QUESTIONS,
    SESAME_QUESTIONS,
    SESAME_TIE_ORDER,
    scoreSesameAnswers
} from "../data/quiz-content.mjs";
import { MUPPET_DESCRIPTIONS, SESAME_CHARACTERS } from "../data/quiz-catalog.mjs";
import { UHCI_QUESTIONS, UHCI_QUESTION_SOURCE } from "../data/uhci-questions.mjs";
import { scoreResponses, UHCI_DIMENSIONS } from "../js/quiz-engine.js";
import { getMuppetMode, MUPPET_STORAGE_KEY } from "../js/muppets-quiz.js";
import { SESAME_STORAGE_KEY } from "../js/sesame-quiz.js";

function answersFor(questions, value = 5.5) {
    return Object.fromEntries(questions.map((question) => [question.id, value]));
}

test("revised questions retain every archival id, primary dimension, reversal, and source reference", () => {
    assert.equal(MUPPET_QUESTIONS.length, 30);
    assert.equal(new Set(MUPPET_QUESTIONS.map((question) => question.prompt)).size, 30);
    for (const [index, question] of MUPPET_QUESTIONS.entries()) {
        const source = UHCI_QUESTIONS[index];
        assert.equal(question.id, source.id);
        assert.equal(question.number, source.number);
        assert.equal(question.dimension, source.dimensions[0]);
        assert.equal(question.dimensions, source.dimensions);
        assert.equal(question.reverseScored, source.reverseScored);
        assert.equal(question.source.path, UHCI_QUESTION_SOURCE);
        assert.equal(question.source.question, source);
        assert.notEqual(question.prompt, source.prompt);
        assert.ok(question.prompt.length > 30);
    }
    assert.deepEqual(MUPPET_QUESTIONS.filter((question) => question.reverseScored).map((question) => question.number),
        [6, 8, 10, 14, 16, 18, 23, 28, 29]);
});

test("quick has one primary item per dimension and full retains its six followed by exactly 24", () => {
    assert.deepEqual(MUPPET_QUICK_QUESTIONS.map((question) => question.dimension), UHCI_DIMENSIONS);
    assert.deepEqual(MUPPET_QUICK_QUESTIONS.map((question) => question.number), [1, 7, 11, 19, 22, 26]);
    assert.deepEqual(MUPPET_FULL_QUESTIONS.slice(0, 6), MUPPET_QUICK_QUESTIONS);
    assert.equal(MUPPET_FULL_QUESTIONS.slice(6).length, 24);
    assert.equal(new Set(MUPPET_FULL_QUESTIONS.map((question) => question.id)).size, 30);
    for (const dimension of UHCI_DIMENSIONS) {
        assert.equal(MUPPET_FULL_QUESTIONS.filter((question) => question.dimension === dimension).length, 5);
    }
    assert.equal(getMuppetQuestions("quick"), MUPPET_QUICK_QUESTIONS);
    assert.equal(getMuppetQuestions("full"), MUPPET_FULL_QUESTIONS);
    assert.throws(() => getMuppetQuestions("unknown"), /Unknown/);
});

test("preview prompts directly sample initiative, composure, inclusion, playful reasoning, performance, and consistency", () => {
    assert.deepEqual(MUPPET_QUICK_QUESTIONS.map((question) => question.prompt), [
        "When friends are waiting for something to happen, I get the first idea rolling.",
        "When a get-together hits a snag, I can take a breath and stay composed.",
        "When choosing what to do together, I look for an option that works for everyone, including me.",
        "When talking about a big idea, a silly example helps me see something true.",
        "When telling a story, I add a little extra expression for the audience.",
        "Whether I am with old friends or new people, I feel like much the same person."
    ]);
    assert.ok(MUPPET_QUICK_QUESTIONS.every((question) => !question.reverseScored));
});

test("five frequency choices are exactly spaced and reversed by 11-x, including unchanged midpoint", () => {
    assert.deepEqual(FREQUENCY_OPTIONS.map((option) => option.label),
        ["Almost never", "Rarely", "Sometimes", "Often", "Almost always"]);
    assert.deepEqual(FREQUENCY_OPTIONS.map((option) => option.value), [1, 3.25, 5.5, 7.75, 10]);
    assert.ok(Object.isFrozen(FREQUENCY_OPTIONS));
    for (const [index, { value }] of FREQUENCY_OPTIONS.entries()) {
        const scores = scoreResponses(MUPPET_QUICK_QUESTIONS, answersFor(MUPPET_QUICK_QUESTIONS, value));
        assert.deepEqual(scores, { ED: value, EC: value, SA: value, RL: value, SH: value, BS: value });
        assert.equal(11 - value, FREQUENCY_OPTIONS.at(-1 - index).value);
    }
    assert.deepEqual(scoreResponses(MUPPET_FULL_QUESTIONS, answersFor(MUPPET_FULL_QUESTIONS)),
        { ED: 5.5, EC: 5.5, SA: 5.5, RL: 5.5, SH: 5.5, BS: 5.5 });
});

test("every choice on all 30 revised items scores only its primary dimension with the original reversal direction", () => {
    for (const question of MUPPET_FULL_QUESTIONS) {
        for (const { value } of FREQUENCY_OPTIONS) {
            const answers = answersFor(MUPPET_FULL_QUESTIONS);
            answers[question.id] = value;
            const scores = scoreResponses(MUPPET_FULL_QUESTIONS, answers);
            const scoredValue = question.reverseScored ? 11 - value : value;
            for (const dimension of UHCI_DIMENSIONS) {
                assert.equal(scores[dimension],
                    dimension === question.dimension ? (4 * 5.5 + scoredValue) / 5 : 5.5,
                    `${question.id} with ${value} changed ${dimension} unexpectedly`);
            }
        }
    }
});

test("one choice step has equal influence across traits: 2.25 in preview and 0.45 in full", () => {
    for (const [questions, expectedChange] of [[MUPPET_QUICK_QUESTIONS, 2.25], [MUPPET_FULL_QUESTIONS, 0.45]]) {
        for (const question of questions) {
            const answers = answersFor(questions);
            answers[question.id] = 7.75;
            const scores = scoreResponses(questions, answers);
            const change = scores[question.dimension] - 5.5;
            assert.ok(Math.abs(change - (question.reverseScored ? -expectedChange : expectedChange)) < 1e-10);
        }
    }
});

test("quick responses carry exact numeric values into the full result without rescoring or reanswering", () => {
    const quickAnswers = Object.fromEntries(MUPPET_QUICK_QUESTIONS.map((question, index) =>
        [question.id, FREQUENCY_OPTIONS[index % 5].value]));
    const fullAnswers = { ...answersFor(MUPPET_FULL_QUESTIONS), ...quickAnswers };
    for (const [id, value] of Object.entries(quickAnswers)) {
        assert.equal(fullAnswers[id], value);
    }
    const quickScores = scoreResponses(MUPPET_QUICK_QUESTIONS, quickAnswers);
    const fullScores = scoreResponses(MUPPET_FULL_QUESTIONS, fullAnswers);
    for (const dimension of UHCI_DIMENSIONS) {
        assert.equal(fullScores[dimension], (quickScores[dimension] + 4 * 5.5) / 5);
    }
});

test("Sesame preserves five character-vote questions and all 1024 outcomes use the explicit old tie order", () => {
    assert.equal(SESAME_QUESTIONS.length, 5);
    for (const [index, question] of SESAME_QUESTIONS.entries()) {
        assert.equal(question.id, `q${index + 1}`);
        assert.deepEqual(question.options.map((option) => option.value), SESAME_TIE_ORDER);
        assert.equal(question.dimension, undefined);
    }
    const winners = new Set();
    for (let encoded = 0; encoded < 4 ** 5; encoded += 1) {
        const choices = Array.from({ length: 5 }, (_, index) => SESAME_TIE_ORDER[Math.floor(encoded / 4 ** index) % 4]);
        const answers = Object.fromEntries(choices.map((choice, index) => [`q${index + 1}`, choice]));
        const counts = SESAME_TIE_ORDER.map((id) => choices.filter((choice) => choice === id).length);
        const result = scoreSesameAnswers(answers);
        assert.equal(result.id, SESAME_TIE_ORDER[counts.indexOf(Math.max(...counts))]);
        assert.equal(Object.values(result.votes).reduce((sum, value) => sum + value, 0), 5);
        winners.add(result.id);
    }
    assert.deepEqual([...winners].sort(), [...SESAME_TIE_ORDER].sort());
    assert.deepEqual(scoreSesameAnswers({ q1: "cookie", q2: "oscar", q3: "cookie", q4: "oscar", q5: "big-bird" }).tiedIds,
        ["cookie", "oscar"]);
});

test("Sesame rejects partial answers and unknown character votes instead of defaulting to Elmo", () => {
    assert.throws(() => scoreSesameAnswers({}), /q1/);
    assert.throws(() => scoreSesameAnswers({ q1: "cookie-monster" }), /q1/);
    assert.throws(() => scoreSesameAnswers({ q1: "elmo", q2: "elmo", q3: "elmo", q4: "elmo" }), /q5/);
});

test("warm copy covers the unchanged 15 production IDs without introducing another score catalog", () => {
    assert.deepEqual(Object.keys(MUPPET_DESCRIPTIONS), [
        "kermit", "miss-piggy", "fozzie", "gonzo", "animal", "rowlf", "scooter",
        "statler-waldorf", "swedish-chef", "beaker", "sam-eagle", "rizzo", "pepe", "bunsen", "walter"
    ]);
    assert.ok(Object.values(MUPPET_DESCRIPTIONS).every((copy) => typeof copy === "string" && copy.length > 80));
    assert.deepEqual(SESAME_CHARACTERS.map((character) => character.id), SESAME_TIE_ORDER);
    for (const character of SESAME_CHARACTERS) {
        assert.equal(character.universe, "sesame-street");
        assert.equal(character.scores, null);
        assert.equal(character.dimensions, undefined);
        assert.ok(existsSync(new URL(`../${character.image}`, import.meta.url)));
    }
});

test("default preview, explicit full route, and versioned per-universe storage stay distinct", () => {
    assert.equal(getMuppetMode(""), "quick");
    assert.equal(getMuppetMode("?mode=full"), "full");
    assert.equal(getMuppetMode("?mode=quick"), "quick");
    assert.equal(getMuppetMode("?mode=unknown"), "quick");
    assert.match(MUPPET_STORAGE_KEY, /frequency-v2$/);
    assert.notEqual(MUPPET_STORAGE_KEY, SESAME_STORAGE_KEY);
});

test("both production pages use shared journey/results styles and external entrypoints", () => {
    for (const [page, entry] of [["muppets.html", "muppets-quiz"], ["sesame-street.html", "sesame-quiz"]]) {
        const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
        assert.match(html, /href="styles\/quiz.css"/);
        assert.match(html, /href="styles\/results.css"/);
        assert.match(html, new RegExp(`type="module" src="js/${entry}.js"`));
        assert.match(html, /Fan-made entertainment, not a validated personality test/);
        assert.match(html, /data-quiz-completion hidden tabindex="-1"/);
        assert.match(html, /data-quiz-error role="alert"/);
        assert.doesNotMatch(html, /<script>/);
    }
});
