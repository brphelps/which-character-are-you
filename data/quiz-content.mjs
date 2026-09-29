import { UHCI_QUESTIONS, UHCI_QUESTION_SOURCE } from "./uhci-questions.mjs";

// Five evenly spaced points on the existing 1-10 baseline scale. Unlike the
// former 1/3/5/7/10 choices, the midpoint and every pair stay symmetric under 11-x.
export const FREQUENCY_OPTIONS = Object.freeze([
    Object.freeze({ value: 1, label: "Almost never" }),
    Object.freeze({ value: 3.25, label: "Rarely" }),
    Object.freeze({ value: 5.5, label: "Sometimes" }),
    Object.freeze({ value: 7.75, label: "Often" }),
    Object.freeze({ value: 10, label: "Almost always" })
]);

// Revised live wording keeps archival IDs and scoring directions. The source
// questions and their secondary associations remain provenance, not live coverage.
const muppetPrompts = [
    "When friends are waiting for something to happen, I get the first idea rolling.",
    "When our plans are a little fuzzy, I help the group work out a next step.",
    "When the group is pulling in different directions, I am happy to steer us toward a plan.",
    "When I have an idea for a project of my own, I take a first step without waiting for encouragement.",
    "When something I use could work better, I take the lead in trying to improve it.",
    "When a small setback upsets me, I have trouble settling down afterward.",
    "When a get-together hits a snag, I can take a breath and stay composed.",
    "In an emotional moment, my feelings take the lead before I have weighed things up.",
    "When a disagreement gets heated, I keep my response measured.",
    "When an urge strikes, I act on it even if I had planned to hold off.",
    "When choosing what to do together, I look for an option that works for everyone, including me.",
    "When a shared effort goes well, I make sure others get credit for their part.",
    "When a shared project gets tricky, I look for ways we can help each other.",
    "When making plans with others, my own priorities guide my choice more than the group's preferences.",
    "When someone is having a rough day, I offer help if they would welcome it.",
    "When we make up a story or a game, I steer it toward things that could really happen.",
    "When a story gets delightfully ridiculous, I enjoy going along with it.",
    "When an idea is explained through a fanciful comparison, I look for a plain, literal explanation instead.",
    "When talking about a big idea, a silly example helps me see something true.",
    "When imagining possibilities, I come up with combinations that would be impossible in real life.",
    "When sharing an experience, I deliberately build up to a reveal for the people listening.",
    "When telling a story, I add a little extra expression for the audience.",
    "When something funny happens around me, I stay in the moment rather than turn it into a performance.",
    "When joking with friends, I deliberately slip into an exaggerated character for comic effect.",
    "When everyone is swept up in a moment, I am happy to step outside it for a playful aside.",
    "Whether I am with old friends or new people, I feel like much the same person.",
    "When friends make plans with me, they have a good idea of what to expect.",
    "Even when my circumstances stay the same, I switch which personal goals I want to pursue.",
    "My usual habits change a lot from one week to the next, even when daily life stays much the same.",
    "When a situation changes, the same core priorities still guide my choices."
];

export const MUPPET_QUESTIONS = Object.freeze(UHCI_QUESTIONS.map((source, index) => Object.freeze({
    ...source,
    prompt: muppetPrompts[index],
    dimension: source.dimensions[0],
    source: Object.freeze({ path: UHCI_QUESTION_SOURCE, question: source }),
    options: FREQUENCY_OPTIONS
})));

export const MUPPET_QUICK_QUESTIONS = Object.freeze(
    MUPPET_QUESTIONS.filter((question) => [1, 7, 11, 19, 22, 26].includes(question.number))
);

// Full mode starts with the same six opening questions, then the remaining 24.
// This lets refinement start after the preview without losing edit access.
export const MUPPET_FULL_QUESTIONS = Object.freeze([
    ...MUPPET_QUICK_QUESTIONS,
    ...MUPPET_QUESTIONS.filter((question) => !MUPPET_QUICK_QUESTIONS.includes(question))
]);

export function getMuppetQuestions(mode) {
    if (!["quick", "full"].includes(mode)) {
        throw new TypeError(`Unknown Muppet quiz mode: ${mode}`);
    }
    return mode === "full" ? MUPPET_FULL_QUESTIONS : MUPPET_QUICK_QUESTIONS;
}

function sesameQuestion(id, prompt, labels) {
    const characters = ["elmo", "cookie", "oscar", "big-bird"];
    return Object.freeze({
        id,
        prompt,
        options: Object.freeze(labels.map((label, index) => Object.freeze({
            value: characters[index],
            label
        })))
    });
}

export const SESAME_QUESTIONS = Object.freeze([
    sesameQuestion("q1", "Which little spark would your friends recognize in you?", [
        "A cheerful burst of energy",
        "Enthusiasm for a tasty treat",
        "A lovingly grumbly sense of humor",
        "Kindness and a curious question"
    ]),
    sesameQuestion("q2", "You have a free afternoon. What sounds most like your kind of fun?", [
        "Playing or hanging out with friends",
        "Cooking something delicious",
        "Adding an interesting find to my collection",
        "Learning something new"
    ]),
    sesameQuestion("q3", "What would make a weekend feel just right?", [
        "Lots of laughter with my favorite people",
        "Trying a new recipe",
        "Time to relax in my own cozy space",
        "Exploring somewhere I have never been"
    ]),
    sesameQuestion("q4", "A small problem pops up. What is your first move?", [
        "Look for the bright side and ask a friend for help",
        "Have a snack and come back to it",
        "Have a little grumble, then work it out",
        "Ask questions and think it through"
    ]),
    sesameQuestion("q5", "Which small treasure matters most to you?", [
        "Feeling close to the people I love",
        "Enjoying life's simple pleasures",
        "Being myself, quirks and all",
        "Understanding a little more about the world"
    ])
]);

// Preserve the old production tie order explicitly, rather than relying on
// object iteration: Elmo, Cookie Monster, Oscar, then Big Bird.
export const SESAME_TIE_ORDER = Object.freeze(["elmo", "cookie", "oscar", "big-bird"]);

export function scoreSesameAnswers(answers) {
    const votes = Object.fromEntries(SESAME_TIE_ORDER.map((id) => [id, 0]));
    for (const question of SESAME_QUESTIONS) {
        const value = answers && Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
        if (!question.options.some((option) => option.value === value)) {
            throw new TypeError(`Choose a valid answer for Sesame question "${question.id}".`);
        }
        votes[value] += 1;
    }
    const highest = Math.max(...Object.values(votes));
    const tiedIds = SESAME_TIE_ORDER.filter((id) => votes[id] === highest);
    return Object.freeze({
        id: tiedIds[0],
        votes: Object.freeze(votes),
        tiedIds: Object.freeze(tiedIds)
    });
}
