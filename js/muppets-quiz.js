import { createQuizController } from "./quiz-controller.js";
import { scoreResponses } from "./quiz-engine.js";
import { getMuppetQuestions, MUPPET_QUESTIONS } from "../data/quiz-content.mjs";

export const MUPPET_STORAGE_KEY = "which-character-are-you:muppets:frequency-v1";

export function getMuppetMode(search) {
    return new URLSearchParams(search).get("mode") === "full" ? "full" : "quick";
}

export function startMuppetQuiz(root, { profileFromScores, renderResults }) {
    let mode = getMuppetMode(window.location.search);
    const resultRoot = root.querySelector("[data-quiz-result]");
    const modeLinks = [...root.querySelectorAll("[data-quiz-mode]")];

    function updateModeCopy() {
        root.querySelector("[data-quiz-title]").textContent = mode === "quick"
            ? "Quick preview: 6 questions"
            : "Full profile: 30 questions";
        root.querySelector("[data-quiz-intro]").textContent = mode === "quick"
            ? "A provisional little teaser, with one question for each of six playful traits. Meet a Muppet match, then go deeper if you like."
            : "A more detailed look at your Muppet energy. Any answers from your quick preview are already here; you can revisit them at any time.";
        for (const link of modeLinks) {
            if (link.dataset.quizMode === mode) {
                link.setAttribute("aria-current", "true");
            } else {
                link.removeAttribute("aria-current");
            }
        }
    }

    updateModeCopy();
    const controller = createQuizController({
        root,
        questions: getMuppetQuestions(mode),
        questionBank: MUPPET_QUESTIONS,
        journeyId: mode,
        storageKey: MUPPET_STORAGE_KEY,
        onComplete(responses, journey) {
            const answers = Object.fromEntries(responses.map(({ questionId, value }) => [questionId, value]));
            const scores = scoreResponses(journey.questions, answers);
            const profile = { ...profileFromScores(scores), mode };
            renderResults(resultRoot, profile, {
                mode,
                quizUrl: "muppets.html",
                onRefine: mode === "quick" ? () => changeMode("full") : undefined,
                onRetake: () => journey.reset()
            });
        }
    });

    function changeMode(nextMode, { updateUrl = true } = {}) {
        mode = nextMode;
        if (updateUrl) {
            const url = new URL(window.location.href);
            url.searchParams.set("mode", mode);
            window.history.pushState(null, "", url);
        }
        updateModeCopy();
        controller.setQuestions(getMuppetQuestions(mode), { journeyId: mode });
    }

    const handleModeClick = (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
            return;
        }
        event.preventDefault();
        changeMode(event.currentTarget.dataset.quizMode);
    };
    const handlePopState = () => changeMode(getMuppetMode(window.location.search), { updateUrl: false });
    modeLinks.forEach((link) => link.addEventListener("click", handleModeClick));
    window.addEventListener("popstate", handlePopState);
    root.querySelector("[data-quiz-loading]").hidden = true;

    return {
        controller,
        destroy() {
            controller.destroy();
            modeLinks.forEach((link) => link.removeEventListener("click", handleModeClick));
            window.removeEventListener("popstate", handlePopState);
        }
    };
}

const root = typeof document !== "undefined" ? document.querySelector("[data-muppets-quiz]") : null;
if (root) {
    Promise.all([import("./muppet-profile.js"), import("./results-view.js")])
        .then(([{ profileFromScores }, { renderResults }]) => {
            if (typeof profileFromScores !== "function" || typeof renderResults !== "function") {
                throw new TypeError("The Muppet profile and result renderer must be available.");
            }
            startMuppetQuiz(root, { profileFromScores, renderResults });
        })
        .catch((error) => {
            root.querySelector("[data-quiz-loading]").textContent =
                "The quiz could not load. Please reload the page to try again. Saved answers have not been cleared.";
            console.error("Unable to start the Muppet quiz.", error);
        });
}
