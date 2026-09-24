import { UHCI_CHARACTERS_BY_ID } from "../data/uhci-characters.mjs";
import { UHCI_QUESTIONS } from "../data/uhci-questions.mjs";
import { MUPPET_DESCRIPTIONS } from "../data/quiz-catalog.mjs";
import { rankCharacters, scoreResponses } from "./quiz-engine.js";

// Keep the original quiz roster, including the single Statler & Waldorf result.
const ROSTER = [
    ["kermit", "muppets-kermit-the-frog"],
    ["miss-piggy", "muppets-miss-piggy"],
    ["fozzie", "muppets-fozzie-bear"],
    ["gonzo", "muppets-gonzo"],
    ["animal", "muppets-animal"],
    ["rowlf", "muppets-rowlf-the-dog"],
    ["scooter", "muppets-scooter"],
    ["statler-waldorf", "muppets-statler"],
    ["swedish-chef", "muppets-swedish-chef"],
    ["beaker", "muppets-beaker"],
    ["sam-eagle", "muppets-sam-the-eagle"],
    ["rizzo", "muppets-rizzo-the-rat"],
    ["pepe", "muppets-pepe-the-king-prawn"],
    ["bunsen", "muppets-dr-bunsen-honeydew"],
    ["walter", "muppets-walter"]
];

export const MUPPET_CHARACTERS = Object.freeze(ROSTER.map(([id, sourceId]) => {
    const character = UHCI_CHARACTERS_BY_ID[sourceId];
    return Object.freeze({
        ...character,
        id,
        name: id === "statler-waldorf" ? "Statler & Waldorf" : character.name,
        description: MUPPET_DESCRIPTIONS[id]
    });
}));

export const MUPPET_QUESTIONS = Object.freeze(UHCI_QUESTIONS.map((question) => Object.freeze({
    id: `q${question.number}`,
    // Secondary associations have no defined weights; preserve primary-block scoring.
    dimension: question.dimensions[0],
    reverseScored: question.reverseScored
})));

export const EXAMPLE_SCORES = Object.freeze({
    ED: 7.6, EC: 7.2, SA: 8.8, RL: 5.8, SH: 4.8, BS: 8.2
});

export function profileFromScores(dimensions, { mode = "full" } = {}) {
    if (!["quick", "full"].includes(mode)) {
        throw new TypeError("Profile mode must be quick or full.");
    }
    const rankings = rankCharacters(dimensions, MUPPET_CHARACTERS);
    return {
        title: "Your Muppet character profile",
        mode,
        dimensions: { ...dimensions },
        matches: rankings.map(({ id, character, matchScore }) => ({
            id,
            name: character.name,
            image: character.image,
            description: character.description,
            dimensions: character.scores,
            score: matchScore
        }))
    };
}

export function profileFromResponses(responses) {
    return profileFromScores(scoreResponses(MUPPET_QUESTIONS, responses));
}
