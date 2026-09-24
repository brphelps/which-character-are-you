import assert from 'node:assert/strict';
import test from 'node:test';

import {
    QuizValidationError,
    rankCharacters,
    scoreQuiz,
    scoreResponses,
    UHCI_DIMENSIONS,
} from '../js/quiz-engine.js';

const oneQuestionPerDimension = UHCI_DIMENSIONS.map((dimension, index) => ({
    id: `q${index + 1}`,
    dimension,
    reverseScored: dimension === 'EC',
}));

test('groups by metadata instead of question range and reverses flagged questions', () => {
    const questions = [
        { id: 'social', dimension: 'SA' },
        { id: 'drive-reverse', dimension: 'ED', reverseScored: true },
        { id: 'stability', dimension: 'BS' },
        { id: 'containment', dimension: 'EC' },
        { id: 'drive', dimension: 'ED' },
        { id: 'show', dimension: 'SH' },
        { id: 'reality', dimension: 'RL' },
    ];
    const scores = scoreResponses(questions, {
        social: '6',
        'drive-reverse': '3',
        stability: '9',
        containment: '10',
        drive: '4',
        show: '8',
        reality: '7',
    });

    assert.deepEqual(scores, {
        ED: 6,
        EC: 10,
        SA: 6,
        RL: 7,
        SH: 8,
        BS: 9,
    });
});

test('reports missing and invalid responses explicitly', () => {
    assert.throws(
        () => scoreResponses(oneQuestionPerDimension, {
            q1: 5,
            q2: 5,
            q3: 11,
            q4: 'not-a-number',
            q6: 5,
        }),
        (error) => {
            assert.ok(error instanceof QuizValidationError);
            assert.deepEqual(
                error.issues.map(({ questionId, code }) => ({ questionId, code })),
                [
                    { questionId: 'q3', code: 'invalid_response' },
                    { questionId: 'q4', code: 'invalid_response' },
                    { questionId: 'q5', code: 'missing_response' },
                ],
            );
            return true;
        },
    );
});

test('ranks all characters by distance and returns at least three top matches', () => {
    const characters = {
        distant: { scores: [10, 10, 10, 10, 10, 10] },
        closest: { scores: [5, 5, 5, 5, 5, 5] },
        second: { scores: [6, 5, 5, 5, 5, 5] },
        third: { scores: [7, 5, 5, 5, 5, 5] },
    };
    const result = scoreQuiz({
        questions: oneQuestionPerDimension,
        responses: { q1: 5, q2: 6, q3: 5, q4: 5, q5: 5, q6: 5 },
        characters,
    });

    assert.deepEqual(result.rankings.map(({ id }) => id), [
        'closest',
        'second',
        'third',
        'distant',
    ]);
    assert.deepEqual(result.topMatches.map(({ id }) => id), [
        'closest',
        'second',
        'third',
    ]);
    assert.equal(result.rankings[0].distance, 0);
    assert.equal(result.rankings[0].matchScore, 100);
});

test('resolves exact ties by ascending character id', () => {
    const tiedScores = [5, 5, 5, 5, 5, 5];
    const rankings = rankCharacters(
        tiedScores,
        {
            zeta: { scores: tiedScores },
            alpha: { scores: tiedScores },
            middle: { scores: tiedScores },
        },
    );

    assert.deepEqual(rankings.map(({ id }) => id), ['alpha', 'middle', 'zeta']);
});

test('keeps normalized dimension and match scores within documented bounds', () => {
    const lowScores = scoreResponses(
        oneQuestionPerDimension,
        { q1: 1, q2: 10, q3: 1, q4: 1, q5: 1, q6: 1 },
    );
    const highScores = scoreResponses(
        oneQuestionPerDimension,
        { q1: 10, q2: 1, q3: 10, q4: 10, q5: 10, q6: 10 },
    );

    for (const scores of [lowScores, highScores]) {
        for (const score of Object.values(scores)) {
            assert.ok(score >= 1 && score <= 10);
        }
    }

    const rankings = rankCharacters(
        lowScores,
        {
            exact: { scores: [1, 1, 1, 1, 1, 1] },
            opposite: { scores: [10, 10, 10, 10, 10, 10] },
        },
    );

    assert.equal(rankings[0].matchScore, 100);
    assert.equal(rankings[1].matchScore, 0);
    assert.ok(rankings.every(({ matchScore }) => matchScore >= 0 && matchScore <= 100));
});
