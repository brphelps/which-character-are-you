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

const warmPrompts = [
    "When friends are waiting for something to happen, I get the first idea rolling.",
    "When our plans are a little fuzzy, I help the group work out a next step.",
    "When the group is pulling in different directions, I am happy to steer us toward a plan.",
    "On a quiet afternoon, I feel the urge to get something going.",
    "When we plan a get-together, I would rather help shape it than wait to see what happens.",
    "When a plan changes, my face gives away how I feel.",
    "When a get-together hits a snag, I can take a breath and stay composed.",
    "In an emotional moment, my feelings take the lead before I have weighed things up.",
    "When things get hectic, friends look to me for a calm presence.",
    "When an idea excites me, I jump in before thinking through the details.",
    "When choosing what to do together, I put the group's happiness ahead of my first choice.",
    "When a friend has a big moment, helping them shine matters more to me than getting the credit.",
    "When a shared project takes longer, I still enjoy working on it together.",
    "When the group's usual way does not suit me, I am comfortable doing my own thing.",
    "When someone in the group feels out of sorts, I feel it is partly on me to help.",
    "When someone explains a game, I prefer clear rules to a playful 'we will see!'",
    "When a story gets delightfully ridiculous, I enjoy going along with it.",
    "When someone tells me something, I take their words at face value.",
    "When talking about a big idea, a silly example helps me see something true.",
    "When a story bends its own logic, I am happy to enjoy the ride.",
    "When I am with a group, I notice how I am coming across, even in a serious moment.",
    "When telling a story, I add a little extra expression for the audience.",
    "When something is happening around me, I am caught up in the moment rather than watching myself in it.",
    "When friends expect me to be the planner, joker, or listener, I knowingly step into that role.",
    "When everyone is swept up in a moment, I am happy to step outside it for a playful aside.",
    "Whether I am with old friends or new people, I feel like much the same person.",
    "When friends make plans with me, they have a good idea of what to expect.",
    "When my mood changes, the same little situation can get a very different reaction from me.",
    "On a stressful day, I act quite differently from my usual self.",
    "When the pressure is on, I stick to my usual values and ways of doing things."
];

export const MUPPET_QUESTIONS = Object.freeze(UHCI_QUESTIONS.map((source, index) => Object.freeze({
    ...source,
    prompt: warmPrompts[index],
    dimension: source.dimensions[0],
    source: Object.freeze({ path: UHCI_QUESTION_SOURCE, question: source }),
    options: FREQUENCY_OPTIONS
})));

export const MUPPET_QUICK_QUESTIONS = Object.freeze(
    MUPPET_QUESTIONS.filter((question) => [1, 6, 11, 16, 21, 26].includes(question.number))
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
