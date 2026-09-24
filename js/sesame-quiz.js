import { createQuizController } from "./quiz-controller.js";
import { SESAME_QUESTIONS, scoreSesameAnswers } from "../data/quiz-content.mjs";
import { SESAME_CHARACTERS } from "../data/quiz-catalog.mjs";

export const SESAME_STORAGE_KEY = "which-character-are-you:sesame:journey-v1";

export function startSesameQuiz(root, { renderCharacterResult }) {
    const resultRoot = root.querySelector("[data-quiz-result]");
    const controller = createQuizController({
        root,
        questions: SESAME_QUESTIONS,
        journeyId: "sesame",
        storageKey: SESAME_STORAGE_KEY,
        onComplete(responses, journey) {
            const answers = Object.fromEntries(responses.map(({ questionId, value }) => [questionId, value]));
            const result = scoreSesameAnswers(answers);
            const character = SESAME_CHARACTERS.find((candidate) => candidate.id === result.id);
            renderCharacterResult(resultRoot, character, {
                quizUrl: "sesame-street.html",
                onRetake: () => journey.reset()
            });
            const tieNote = root.querySelector("[data-quiz-tie]");
            tieNote.hidden = result.tiedIds.length < 2;
            tieNote.textContent = result.tiedIds.length > 1
                ? `A friendly tie between ${result.tiedIds.map((id) => SESAME_CHARACTERS.find((candidate) => candidate.id === id).name).join(" and ")}! We use a fixed order to choose one: Elmo, Cookie Monster, Oscar, then Big Bird.`
                : "";
        }
    });
    root.querySelector("[data-quiz-loading]").hidden = true;
    return controller;
}

const root = typeof document !== "undefined" ? document.querySelector("[data-sesame-quiz]") : null;
if (root) {
    import("./results-view.js")
        .then(({ renderCharacterResult }) => {
            if (typeof renderCharacterResult !== "function") {
                throw new TypeError("The character-only result renderer must be available.");
            }
            startSesameQuiz(root, { renderCharacterResult });
        })
        .catch((error) => {
            root.querySelector("[data-quiz-loading]").textContent =
                "The quiz could not load. Please reload the page to try again. Saved answers have not been cleared.";
            console.error("Unable to start the Sesame Street quiz.", error);
        });
}
