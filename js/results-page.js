import { EXAMPLE_SCORES, MUPPET_CHARACTERS, profileFromScores } from "./muppet-profile.js";
import { SESAME_CHARACTERS } from "../data/quiz-catalog.mjs";
import { decodeResult, hydrateSharedResult, renderCharacterResult, renderResults } from "./results-view.js";

const catalog = MUPPET_CHARACTERS.map((character) => ({
    ...character, dimensions: character.scores
}));

export function resolveResultRoute(href, { allowExample = false } = {}) {
    const url = new URL(href);
    const characters = url.searchParams.getAll("character");
    const examples = url.searchParams.getAll("example");
    const encoded = new URLSearchParams(url.hash.slice(1)).getAll("result");
    if (url.searchParams.has("result") || url.searchParams.has("profile")) {
        throw new TypeError("Detailed profiles must use the complete #result= link.");
    }
    const routeCount = Number(characters.length > 0) + Number(examples.length > 0) + Number(Boolean(url.hash));
    if (routeCount > 1 || characters.length > 1 || examples.length > 1 || encoded.length > 1) {
        throw new TypeError("This link mixes multiple results. Use one character, example, or profile link.");
    }
    if (characters.length) {
        const character = [...MUPPET_CHARACTERS, ...SESAME_CHARACTERS].find(({ id }) => id === characters[0]);
        if (!character) {
            throw new TypeError("This character is not in the available catalog.");
        }
        return { type: "character", character };
    }
    if (url.hash) {
        if (encoded.length !== 1 || !encoded[0]) {
            throw new TypeError("The link must contain one complete result. Please copy the entire shared link.");
        }
        const compact = decodeResult(encoded[0]);
        return { type: "profile", result: hydrateSharedResult(compact, catalog), legacy: compact.v === 1 };
    }
    if (examples.length && examples[0] !== "1") {
        throw new TypeError("This example link is invalid.");
    }
    if (examples[0] === "1" || allowExample) {
        return { type: "profile", result: { ...profileFromScores(EXAMPLE_SCORES), example: true }, legacy: false };
    }
    return { type: "empty" };
}

function showNotice(root, title, message) {
    const section = document.createElement("section");
    section.className = "notice-card";
    const heading = document.createElement("h1");
    heading.textContent = title;
    const detail = document.createElement("p");
    detail.textContent = message;
    const links = document.createElement("p");
    const quiz = document.createElement("a");
    quiz.href = "muppets.html";
    quiz.textContent = "Take the Muppet quiz";
    const example = document.createElement("a");
    example.href = "results.html?example=1";
    example.textContent = "Explore an example profile";
    links.append(quiz, document.createTextNode(" or "), example);
    section.append(heading, detail, links);
    root.replaceChildren(section);
}

export function loadResults() {
    const root = document.querySelector("[data-results-root]");
    const actions = document.querySelector("[data-result-actions]");
    actions.hidden = true;
    document.title = "Your Personality Profile | Which Character Are You?";
    try {
        const route = resolveResultRoute(window.location.href, {
            allowExample: document.body.dataset.example === "true"
        });
        if (route.type === "empty") {
            showNotice(root, "Your personality profile starts here",
                "Start with six questions for a provisional match, then answer more to refine your profile. No account is needed.");
            return;
        }
        if (route.type === "character") {
            const quizUrl = route.character.universe === "sesame-street" ? "sesame-street.html" : "muppets.html";
            renderCharacterResult(root, route.character, { quizUrl, shared: true });
            document.querySelector(".site-header .button").href = quizUrl;
            document.title = `${route.character.name} | Shared character`;
            return;
        }
        document.querySelector(".site-header .button").href = "muppets.html";
        const { result } = route;
        result.title = result.example ? "Example Muppet profile" : "Your Muppet character profile";
        renderResults(root, result);
        if (result.example || route.legacy) {
            const notice = document.createElement("p");
            notice.className = "load-notice";
            notice.setAttribute("role", "status");
            notice.textContent = result.example
                ? "Example profile — these are sample scores, not your quiz results. Take the quiz to discover your own pattern."
                : "Legacy profile loaded. Matches have been recalculated from these scores using the current Muppet baselines.";
            root.prepend(notice);
        }
        document.title = `${result.example ? "Example: " : ""}${result.matches[0].name} | ${result.mode === "quick" ? "Provisional match" : "Your Personality Profile"}`;
        actions.querySelector("a").textContent = result.example ? "Find my character" : "Take the quiz again";
        actions.hidden = false;
    } catch (error) {
        showNotice(root, "This profile could not be opened",
            `${error.message} No sample result has been substituted. Try opening the original link or take the quiz again.`);
    } finally {
        document.querySelector("[data-loading]")?.remove();
    }
}

if (typeof document !== "undefined") {
    document.querySelector("[data-print]").addEventListener("click", () => window.print());
    document.querySelector(".skip-link").addEventListener("click", (event) => {
        event.preventDefault();
        document.querySelector("#main-content").focus();
    });
    window.addEventListener("hashchange", loadResults);
    loadResults();
}
