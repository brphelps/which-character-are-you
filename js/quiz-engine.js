export const UHCI_DIMENSIONS = Object.freeze(['ED', 'EC', 'SA', 'RL', 'SH', 'BS']);

const DEFAULT_MIN_SCORE = 1;
const DEFAULT_MAX_SCORE = 10;
const DEFAULT_TOP_MATCHES = 3;

export class QuizValidationError extends TypeError {
    constructor(message, issues = []) {
        super(message);
        this.name = 'QuizValidationError';
        this.issues = issues;
    }
}

/**
 * Score complete quiz responses on the common 1-10 UHCI scale.
 *
 * Each question must have a unique `id`, a UHCI `dimension`, and may set
 * `reverseScored: true`. Responses may be a plain object or Map and may contain
 * numbers or numeric strings. Every question requires a valid in-range response.
 */
export function scoreResponses(questions, responses, options = {}) {
    const { minScore, maxScore } = getScale(options);
    const validatedQuestions = validateQuestions(questions);
    const totals = Object.fromEntries(UHCI_DIMENSIONS.map((dimension) => [dimension, 0]));
    const counts = Object.fromEntries(UHCI_DIMENSIONS.map((dimension) => [dimension, 0]));
    const issues = [];

    for (const question of validatedQuestions) {
        const response = getResponse(responses, question.id);

        if (response === undefined || response === null || response === '') {
            issues.push({
                questionId: question.id,
                code: 'missing_response',
                message: `Missing response for question "${question.id}".`,
            });
            continue;
        }

        const value = toFiniteNumber(response);
        if (value === null || value < minScore || value > maxScore) {
            issues.push({
                questionId: question.id,
                code: 'invalid_response',
                message: `Response for question "${question.id}" must be a number from ${minScore} to ${maxScore}.`,
                value: response,
            });
            continue;
        }

        const scoredValue = question.reverseScored
            ? minScore + maxScore - value
            : value;
        totals[question.dimension] += scoredValue;
        counts[question.dimension] += 1;
    }

    if (issues.length > 0) {
        throw new QuizValidationError(
            `Quiz responses are incomplete or invalid (${issues.length} issue${issues.length === 1 ? '' : 's'}).`,
            issues,
        );
    }

    const scores = {};
    for (const dimension of UHCI_DIMENSIONS) {
        if (counts[dimension] === 0) {
            throw new QuizValidationError(
                `Question metadata must include at least one question for dimension "${dimension}".`,
            );
        }
        scores[dimension] = totals[dimension] / counts[dimension];
    }

    return Object.freeze(scores);
}

/**
 * Rank every supplied character by Euclidean distance from the UHCI scores.
 *
 * Exact ties are resolved by character id using ascending Unicode code-point
 * order, so ranking does not depend on object insertion order or sort stability.
 * `matchScore` is a 0-100 percentage of the maximum possible distance on the
 * configured scale: 100 is an exact match and 0 is the opposite scale extreme.
 */
export function rankCharacters(scores, characters, options = {}) {
    const { minScore, maxScore } = getScale(options);
    const userVector = toScoreVector(scores, 'Quiz scores', minScore, maxScore);
    const entries = toCharacterEntries(characters);
    const maximumDistance = Math.sqrt(UHCI_DIMENSIONS.length) * (maxScore - minScore);

    return entries
        .map(({ id, character }) => {
            const characterVector = toScoreVector(
                character.scores,
                `Scores for character "${id}"`,
                minScore,
                maxScore,
            );
            const distance = euclideanDistance(userVector, characterVector);
            const matchScore = clamp(100 * (1 - distance / maximumDistance), 0, 100);

            return Object.freeze({
                id,
                character,
                distance,
                matchScore,
            });
        })
        .sort((left, right) => {
            const distanceDifference = left.distance - right.distance;
            return distanceDifference !== 0
                ? distanceDifference
                : compareIds(left.id, right.id);
        });
}

/**
 * Score responses and rank all characters in one operation.
 */
export function scoreQuiz({ questions, responses, characters, topCount = DEFAULT_TOP_MATCHES, ...options }) {
    if (!Number.isInteger(topCount) || topCount < DEFAULT_TOP_MATCHES) {
        throw new QuizValidationError(
            `topCount must be an integer of at least ${DEFAULT_TOP_MATCHES}.`,
        );
    }

    const scores = scoreResponses(questions, responses, options);
    const rankings = rankCharacters(scores, characters, options);

    if (rankings.length < DEFAULT_TOP_MATCHES) {
        throw new QuizValidationError(
            `At least ${DEFAULT_TOP_MATCHES} characters are required to return the top three matches.`,
        );
    }

    return Object.freeze({
        scores,
        rankings: Object.freeze(rankings),
        topMatches: Object.freeze(rankings.slice(0, topCount)),
    });
}

function validateQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new QuizValidationError('Questions must be a non-empty array.');
    }

    const seenIds = new Set();
    return questions.map((question, index) => {
        if (!question || typeof question !== 'object') {
            throw new QuizValidationError(`Question at index ${index} must be an object.`);
        }
        if (question.id === undefined || question.id === null || question.id === '') {
            throw new QuizValidationError(`Question at index ${index} must have an id.`);
        }

        const id = String(question.id);
        if (seenIds.has(id)) {
            throw new QuizValidationError(`Question id "${id}" is duplicated.`);
        }
        seenIds.add(id);

        if (!UHCI_DIMENSIONS.includes(question.dimension)) {
            throw new QuizValidationError(
                `Question "${id}" has invalid dimension "${question.dimension}".`,
            );
        }
        if (
            question.reverseScored !== undefined
            && typeof question.reverseScored !== 'boolean'
        ) {
            throw new QuizValidationError(
                `Question "${id}" reverseScored flag must be a boolean.`,
            );
        }

        return {
            id,
            dimension: question.dimension,
            reverseScored: question.reverseScored === true,
        };
    });
}

function getResponse(responses, id) {
    if (responses instanceof Map) {
        return responses.get(id);
    }
    if (responses && typeof responses === 'object') {
        return Object.prototype.hasOwnProperty.call(responses, id)
            ? responses[id]
            : undefined;
    }
    throw new QuizValidationError('Responses must be a plain object or Map.');
}

function toCharacterEntries(characters) {
    let entries;

    if (Array.isArray(characters)) {
        entries = characters.map((character, index) => {
            if (!character || typeof character !== 'object' || !character.id) {
                throw new QuizValidationError(
                    `Character at index ${index} must be an object with an id.`,
                );
            }
            return { id: String(character.id), character };
        });
    } else if (characters && typeof characters === 'object') {
        entries = Object.entries(characters).map(([id, character]) => ({ id, character }));
    } else {
        throw new QuizValidationError('Characters must be a non-empty object or array.');
    }

    if (entries.length === 0) {
        throw new QuizValidationError('Characters must be a non-empty object or array.');
    }

    const ids = new Set();
    for (const { id, character } of entries) {
        if (ids.has(id)) {
            throw new QuizValidationError(`Character id "${id}" is duplicated.`);
        }
        ids.add(id);
        if (!character || typeof character !== 'object') {
            throw new QuizValidationError(`Character "${id}" must be an object.`);
        }
    }

    return entries;
}

function toScoreVector(scores, label, minScore, maxScore) {
    const vector = Array.isArray(scores)
        ? scores
        : UHCI_DIMENSIONS.map((dimension) => scores?.[dimension]);

    if (vector.length !== UHCI_DIMENSIONS.length) {
        throw new QuizValidationError(
            `${label} must contain exactly ${UHCI_DIMENSIONS.length} UHCI dimensions.`,
        );
    }

    return vector.map((score, index) => {
        const value = toFiniteNumber(score);
        if (value === null || value < minScore || value > maxScore) {
            throw new QuizValidationError(
                `${label} dimension "${UHCI_DIMENSIONS[index]}" must be a number from ${minScore} to ${maxScore}.`,
            );
        }
        return value;
    });
}

function getScale({ minScore = DEFAULT_MIN_SCORE, maxScore = DEFAULT_MAX_SCORE } = {}) {
    if (
        !Number.isFinite(minScore)
        || !Number.isFinite(maxScore)
        || minScore >= maxScore
    ) {
        throw new QuizValidationError('minScore and maxScore must be finite numbers with minScore less than maxScore.');
    }
    return { minScore, maxScore };
}

function toFiniteNumber(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }
    return null;
}

function euclideanDistance(left, right) {
    return Math.sqrt(left.reduce((sum, value, index) => {
        const difference = value - right[index];
        return sum + difference * difference;
    }, 0));
}

function compareIds(left, right) {
    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}
