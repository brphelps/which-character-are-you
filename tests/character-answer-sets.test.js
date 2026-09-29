import assert from "node:assert/strict";
import test from "node:test";

import { SESAME_CHARACTERS } from "../data/quiz-catalog.mjs";
import { getMuppetQuestions, SESAME_QUESTIONS, scoreSesameAnswers } from "../data/quiz-content.mjs";
import { MUPPET_CHARACTERS, profileFromScores } from "../js/muppet-profile.js";
import { scoreResponses, UHCI_DIMENSIONS } from "../js/quiz-engine.js";

// Fixed UI choices in Q1-Q30 order, with one row per five-question block.
// Reversed items already contain the raw answer, not the reversed score.
// Keep these independent of live baselines and scoring metadata.
const muppetAnswerSets = {
    kermit: {
        answers: [
            10, 7.75, 7.75, 10, 10,
            3.25, 7.75, 3.25, 7.75, 1,
            10, 7.75, 7.75, 1, 10,
            10, 3.25, 7.75, 3.25, 3.25,
            5.5, 5.5, 5.5, 5.5, 7.75,
            7.75, 7.75, 3.25, 3.25, 10
        ],
        quick: [10, 7.75, 10, 3.25, 5.5, 7.75],
        full: [9.1, 8.2, 9.1, 2.8, 5.95, 8.2]
    },
    "miss-piggy": {
        answers: [
            10, 7.75, 7.75, 10, 10,
            10, 1, 10, 3.25, 7.75,
            5.5, 3.25, 5.5, 5.5, 5.5,
            7.75, 3.25, 5.5, 3.25, 5.5,
            5.5, 7.75, 5.5, 7.75, 7.75,
            3.25, 3.25, 7.75, 5.5, 5.5
        ],
        quick: [10, 1, 5.5, 3.25, 7.75, 3.25],
        full: [9.1, 1.9, 5.05, 4.15, 6.85, 4.15]
    },
    fozzie: {
        answers: [
            7.75, 5.5, 5.5, 7.75, 7.75,
            10, 3.25, 7.75, 3.25, 7.75,
            7.75, 7.75, 7.75, 3.25, 10,
            7.75, 5.5, 5.5, 5.5, 5.5,
            5.5, 5.5, 5.5, 5.5, 7.75,
            3.25, 3.25, 7.75, 5.5, 5.5
        ],
        quick: [7.75, 3.25, 7.75, 5.5, 5.5, 3.25],
        full: [6.85, 2.8, 8.2, 5.05, 5.95, 4.15]
    },
    gonzo: {
        answers: [
            7.75, 7.75, 7.75, 7.75, 10,
            7.75, 3.25, 7.75, 5.5, 5.5,
            5.5, 5.5, 5.5, 5.5, 7.75,
            3.25, 7.75, 1, 10, 10,
            5.5, 7.75, 5.5, 7.75, 7.75,
            5.5, 3.25, 5.5, 5.5, 5.5
        ],
        quick: [7.75, 3.25, 5.5, 10, 7.75, 5.5],
        full: [8.2, 4.15, 5.95, 9.1, 6.85, 5.05]
    },
    animal: {
        answers: [
            7.75, 5.5, 5.5, 7.75, 7.75,
            10, 1, 10, 1, 10,
            3.25, 3.25, 3.25, 5.5, 5.5,
            5.5, 5.5, 5.5, 5.5, 7.75,
            3.25, 5.5, 5.5, 5.5, 5.5,
            1, 1, 10, 7.75, 3.25
        ],
        quick: [7.75, 1, 3.25, 5.5, 5.5, 1],
        full: [6.85, 1, 4.15, 5.95, 5.05, 1.9]
    },
    rowlf: {
        answers: [
            5.5, 5.5, 5.5, 5.5, 7.75,
            3.25, 7.75, 3.25, 7.75, 1,
            7.75, 7.75, 7.75, 3.25, 10,
            10, 3.25, 7.75, 3.25, 3.25,
            3.25, 5.5, 5.5, 5.5, 5.5,
            7.75, 7.75, 3.25, 3.25, 10
        ],
        quick: [5.5, 7.75, 7.75, 3.25, 5.5, 7.75],
        full: [5.95, 8.2, 8.2, 2.8, 5.05, 8.2]
    },
    scooter: {
        answers: [
            7.75, 7.75, 7.75, 7.75, 10,
            3.25, 10, 3.25, 10, 1,
            7.75, 7.75, 7.75, 3.25, 10,
            10, 1, 7.75, 1, 3.25,
            3.25, 3.25, 7.75, 5.5, 5.5,
            10, 7.75, 3.25, 1, 10
        ],
        quick: [7.75, 10, 7.75, 1, 3.25, 10],
        full: [8.2, 9.1, 8.2, 1.9, 4.15, 9.1]
    },
    "statler-waldorf": {
        answers: [
            5.5, 5.5, 5.5, 5.5, 7.75,
            5.5, 7.75, 5.5, 7.75, 3.25,
            3.25, 1, 3.25, 7.75, 3.25,
            7.75, 3.25, 5.5, 3.25, 5.5,
            7.75, 7.75, 3.25, 7.75, 10,
            7.75, 5.5, 5.5, 3.25, 7.75
        ],
        quick: [5.5, 7.75, 3.25, 3.25, 7.75, 7.75],
        full: [5.95, 6.85, 2.8, 4.15, 8.2, 6.85]
    },
    "swedish-chef": {
        answers: [
            5.5, 5.5, 5.5, 5.5, 7.75,
            10, 3.25, 7.75, 3.25, 7.75,
            5.5, 3.25, 5.5, 5.5, 5.5,
            3.25, 7.75, 3.25, 7.75, 10,
            5.5, 7.75, 5.5, 7.75, 7.75,
            3.25, 3.25, 7.75, 5.5, 5.5
        ],
        quick: [5.5, 3.25, 5.5, 7.75, 7.75, 3.25],
        full: [5.95, 2.8, 5.05, 8.2, 6.85, 4.15]
    },
    beaker: {
        answers: [
            3.25, 3.25, 3.25, 5.5, 5.5,
            10, 1, 10, 3.25, 7.75,
            7.75, 5.5, 5.5, 3.25, 7.75,
            7.75, 3.25, 5.5, 3.25, 5.5,
            3.25, 3.25, 7.75, 5.5, 5.5,
            3.25, 1, 7.75, 7.75, 3.25
        ],
        quick: [3.25, 1, 7.75, 3.25, 3.25, 3.25],
        full: [4.15, 1.9, 6.85, 4.15, 4.15, 2.8]
    },
    "sam-eagle": {
        answers: [
            7.75, 7.75, 7.75, 7.75, 10,
            3.25, 10, 3.25, 10, 1,
            3.25, 3.25, 3.25, 5.5, 5.5,
            10, 1, 7.75, 1, 3.25,
            3.25, 5.5, 5.5, 5.5, 5.5,
            10, 7.75, 3.25, 1, 10
        ],
        quick: [7.75, 10, 3.25, 1, 5.5, 10],
        full: [8.2, 9.1, 4.15, 1.9, 5.05, 9.1]
    },
    rizzo: {
        answers: [
            7.75, 5.5, 5.5, 7.75, 7.75,
            7.75, 3.25, 7.75, 5.5, 5.5,
            5.5, 3.25, 5.5, 5.5, 5.5,
            7.75, 5.5, 5.5, 5.5, 5.5,
            5.5, 7.75, 5.5, 7.75, 7.75,
            5.5, 3.25, 5.5, 5.5, 5.5
        ],
        quick: [7.75, 3.25, 5.5, 5.5, 7.75, 5.5],
        full: [6.85, 4.15, 5.05, 5.05, 6.85, 5.05]
    },
    pepe: {
        answers: [
            7.75, 7.75, 7.75, 7.75, 10,
            10, 3.25, 7.75, 3.25, 7.75,
            3.25, 3.25, 3.25, 5.5, 5.5,
            5.5, 5.5, 5.5, 5.5, 7.75,
            5.5, 7.75, 5.5, 7.75, 7.75,
            3.25, 3.25, 7.75, 5.5, 5.5
        ],
        quick: [7.75, 3.25, 3.25, 5.5, 7.75, 3.25],
        full: [8.2, 2.8, 4.15, 5.95, 6.85, 4.15]
    },
    bunsen: {
        answers: [
            7.75, 5.5, 5.5, 7.75, 7.75,
            3.25, 10, 3.25, 10, 1,
            5.5, 5.5, 5.5, 5.5, 7.75,
            10, 3.25, 7.75, 3.25, 3.25,
            3.25, 3.25, 7.75, 5.5, 5.5,
            7.75, 7.75, 3.25, 3.25, 10
        ],
        quick: [7.75, 10, 5.5, 3.25, 3.25, 7.75],
        full: [6.85, 9.1, 5.95, 2.8, 4.15, 8.2]
    },
    walter: {
        answers: [
            5.5, 5.5, 5.5, 5.5, 7.75,
            5.5, 7.75, 5.5, 7.75, 3.25,
            10, 7.75, 7.75, 1, 10,
            10, 3.25, 7.75, 3.25, 3.25,
            3.25, 3.25, 7.75, 5.5, 5.5,
            7.75, 7.75, 3.25, 3.25, 10
        ],
        quick: [5.5, 7.75, 10, 3.25, 3.25, 7.75],
        full: [5.95, 6.85, 9.1, 2.8, 4.15, 8.2]
    }
};

const sesameAnswerSets = {
    elmo: { q1: "elmo", q2: "cookie", q3: "elmo", q4: "oscar", q5: "elmo" },
    cookie: { q1: "cookie", q2: "elmo", q3: "cookie", q4: "big-bird", q5: "cookie" },
    oscar: { q1: "oscar", q2: "elmo", q3: "oscar", q4: "cookie", q5: "oscar" },
    "big-bird": { q1: "big-bird", q2: "elmo", q3: "big-bird", q4: "cookie", q5: "big-bird" }
};

function assertValidAnswers(questions, answers) {
    assert.deepEqual(Object.keys(answers).sort(), questions.map(({ id }) => id).sort());
    for (const question of questions) {
        assert.ok(question.options.some(({ value }) => value === answers[question.id]),
            `${question.id}: ${answers[question.id]} must be a selectable answer`);
    }
}

test("answer sets cover every production character, without reference-only characters", () => {
    assert.deepEqual(Object.keys(muppetAnswerSets).sort(), MUPPET_CHARACTERS.map(({ id }) => id).sort());
    assert.deepEqual(Object.keys(sesameAnswerSets).sort(), SESAME_CHARACTERS.map(({ id }) => id).sort());
});

for (const [characterId, fixture] of Object.entries(muppetAnswerSets)) {
    for (const mode of ["quick", "full"]) {
        test(`${mode} Muppet answers reveal ${characterId} as the unique closest match`, () => {
            const fullAnswers = Object.fromEntries(fixture.answers.map((value, index) => [
                `uhci-q${String(index + 1).padStart(2, "0")}`, value
            ]));
            assertValidAnswers(getMuppetQuestions("full"), fullAnswers);
            const questions = getMuppetQuestions(mode);
            const answers = Object.fromEntries(questions.map(({ id }) => [id, fullAnswers[id]]));
            assertValidAnswers(questions, answers);

            const scores = scoreResponses(questions, answers);
            assert.deepEqual(UHCI_DIMENSIONS.map((dimension) => scores[dimension]), fixture[mode]);
            const profile = profileFromScores(scores, { mode });
            assert.equal(profile.mode, mode);
            assert.deepEqual(profile.dimensions, scores);
            assert.equal(profile.matches[0].id, characterId);
            assert.ok(profile.matches[0].score > profile.matches[1].score,
                `${characterId} must win on similarity, not a tie-break`);
        });
    }
}

for (const [characterId, answers] of Object.entries(sesameAnswerSets)) {
    test(`mixed Sesame answers reveal ${characterId} with a clear majority`, () => {
        assertValidAnswers(SESAME_QUESTIONS, answers);
        const result = scoreSesameAnswers(answers);
        assert.equal(result.id, characterId);
        assert.equal(result.votes[characterId], 3);
        assert.equal(Object.values(result.votes).reduce((sum, votes) => sum + votes, 0), 5);
        assert.deepEqual(result.tiedIds, [characterId]);
    });
}
