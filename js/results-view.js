import { UHCI_DIMENSIONS, UHCI_DIMENSION_IDS as SCORE_KEYS } from "../data/uhci-dimensions.mjs";
import { rankCharacters } from "./quiz-engine.js";
import { createCharacterShareUrl, downloadResultCard } from "./result-sharing.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DESCRIPTIONS = {
    ED: "How readily you initiate and steer events",
    EC: "How tightly you contain emotional reactions",
    SA: "How strongly you prioritize shared wellbeing",
    RL: "How readily you embrace absurd or playful logic",
    SH: "How aware you are of presentation and audience",
    BS: "How consistent your behavior is across situations"
};

export const DIMENSIONS = Object.freeze(Object.fromEntries(UHCI_DIMENSIONS.map((dimension) => [
    dimension.id,
    Object.freeze({
        name: dimension.name,
        low: dimension.lowAnchor,
        high: dimension.highAnchor,
        description: DESCRIPTIONS[dimension.id]
    })
])));

/**
 * Six scores from the Unified Henson Character Inventory.
 * Every key is required and every value must be a number from 1 through 10.
 *
 * @typedef {Object} UHCIScores
 * @property {number} ED Event Drive
 * @property {number} EC Emotional Containment
 * @property {number} SA Social Aim
 * @property {number} RL Reality Lens
 * @property {number} SH Show-Awareness
 * @property {number} BS Behavioral Stability
 */

/**
 * A ranked character match. `score` is a precomputed profile similarity
 * percentage; `dimensions` is the character's UHCI profile and is used to
 * derive the "why you matched" explanation.
 *
 * @typedef {Object} CharacterMatch
 * @property {string} id Stable lowercase identifier used in compact share URLs
 * @property {string} name Display name
 * @property {number} score Similarity percentage from 0 through 100
 * @property {string} [image] Optional local image URL
 * @property {string} [description] Optional concise character summary
 * @property {UHCIScores} dimensions Character's six UHCI scores
 */

/**
 * Input contract for {@link renderResults}. At least three matches are
 * required. The renderer orders matches by descending `score`, highlights the
 * best match, and displays the top three.
 *
 * @typedef {Object} CharacterResult
 * @property {string} [title] Optional result heading
 * @property {UHCIScores} dimensions Person's six UHCI scores
 * @property {CharacterMatch[]} matches Ranked character matches
 * @property {"quick"|"full"} [mode] Quiz depth; quick profiles are provisional
 * @property {boolean} [example] Whether this is an explicitly labeled sample
 */

function assertNumberInRange(value, minimum, maximum, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
        throw new TypeError(`${label} must be a finite number from ${minimum} through ${maximum}.`);
    }
}

function normalizeScores(scores, label) {
    if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
        throw new TypeError(`${label} must be an object with all six UHCI scores.`);
    }

    return Object.fromEntries(SCORE_KEYS.map((key) => {
        const value = scores[key];
        assertNumberInRange(value, 1, 10, `${label}.${key}`);
        return [key, value];
    }));
}

/**
 * Validate, copy, and rank a result object.
 *
 * @param {CharacterResult} input
 * @returns {CharacterResult}
 */
export function normalizeResult(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new TypeError("Result input must be an object.");
    }
    if (!Array.isArray(input.matches) || input.matches.length < 3) {
        throw new TypeError("Result input must include at least three character matches.");
    }
    if (input.mode !== undefined && !["quick", "full"].includes(input.mode)) {
        throw new TypeError("Result mode must be quick or full.");
    }
    if (input.example !== undefined && typeof input.example !== "boolean") {
        throw new TypeError("Result example flag must be a boolean.");
    }

    const ids = new Set();
    const matches = input.matches.map((match, index) => {
        if (!match || typeof match !== "object" || Array.isArray(match)) {
            throw new TypeError(`matches[${index}] must be an object.`);
        }
        if (typeof match.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(match.id)) {
            throw new TypeError(`matches[${index}].id must be a lowercase identifier.`);
        }
        if (ids.has(match.id)) {
            throw new TypeError(`Character match id "${match.id}" is duplicated.`);
        }
        ids.add(match.id);
        if (typeof match.name !== "string" || !match.name.trim()) {
            throw new TypeError(`matches[${index}].name must be a non-empty string.`);
        }
        assertNumberInRange(match.score, 0, 100, `matches[${index}].score`);

        return {
            id: match.id,
            name: match.name.trim(),
            score: match.score,
            image: typeof match.image === "string" ? match.image : "",
            description: typeof match.description === "string" ? match.description.trim() : "",
            dimensions: normalizeScores(match.dimensions, `matches[${index}].dimensions`)
        };
    });

    matches.sort((first, second) => second.score - first.score);

    return {
        title: typeof input.title === "string" && input.title.trim()
            ? input.title.trim()
            : "Your character profile",
        mode: input.mode ?? "full",
        example: input.example ?? false,
        dimensions: normalizeScores(input.dimensions, "dimensions"),
        matches
    };
}

function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/u, "");
}

function base64UrlToBytes(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) {
        throw new TypeError("Shared result is not valid base64url data.");
    }
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/**
 * Encode six scores and a versioned catalog id, never individual answers.
 * Rankings are recalculated from the local catalog when the link is opened.
 *
 * @param {CharacterResult} input
 * @returns {string}
 */
export function encodeResult(input) {
    const result = normalizeResult(input);
    const compact = {
        v: 2,
        c: "muppets-1",
        d: SCORE_KEYS.map((key) => result.dimensions[key]),
        mode: result.mode,
        example: result.example
    };
    return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(compact)));
}

/**
 * Decode and validate compact URL data. The returned object intentionally
 * contains scores only in v2; v1 prototype links are still accepted.
 *
 * @param {string} encoded
 * @returns {{v: number, c?: string, d: number[], mode?: "quick"|"full", example?: boolean, m?: Array<[string, number]>}}
 */
export function decodeResult(encoded) {
    if (typeof encoded !== "string" || encoded.length > 2048) {
        throw new TypeError("Shared result is missing or too large.");
    }
    let compact;
    try {
        compact = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
    } catch (error) {
        throw new TypeError("Shared result could not be decoded.", { cause: error });
    }

    if (!compact || ![1, 2].includes(compact.v)
        || !Array.isArray(compact.d) || compact.d.length !== SCORE_KEYS.length) {
        throw new TypeError("Shared result uses an unsupported format.");
    }
    compact.d.forEach((score, index) => {
        assertNumberInRange(score, 1, 10, `shared dimension ${index + 1}`);
    });
    if (compact.v === 2) {
        if (compact.c !== "muppets-1") {
            throw new TypeError("Shared result uses an unsupported character catalog.");
        }
        if (compact.mode !== undefined && !["quick", "full"].includes(compact.mode)) {
            throw new TypeError("Shared result uses an unsupported quiz mode.");
        }
        if (compact.example !== undefined && typeof compact.example !== "boolean") {
            throw new TypeError("Shared result has an invalid example flag.");
        }
        return compact;
    }
    if (!Array.isArray(compact.m) || compact.m.length !== 3) {
        throw new TypeError("Shared result must contain exactly three matches.");
    }
    const seenIds = new Set();
    compact.m.forEach((entry, index) => {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string"
            || !/^[a-z0-9-]{1,40}$/.test(entry[0]) || seenIds.has(entry[0])) {
            throw new TypeError(`Shared match ${index + 1} is invalid.`);
        }
        seenIds.add(entry[0]);
        assertNumberInRange(entry[1], 0, 100, `shared match ${index + 1} score`);
    });

    return compact;
}

/**
 * Combine compact shared data with trusted local match metadata.
 *
 * @param {{v: number, d: number[], mode?: "quick"|"full", example?: boolean, m?: Array<[string, number]>}} compact
 * @param {CharacterMatch[]} catalog
 * @returns {CharacterResult}
 */
export function hydrateSharedResult(compact, catalog) {
    const catalogById = new Map(catalog.map((match) => [match.id, match]));
    for (const [id] of compact.m ?? []) {
        if (!catalogById.has(id)) {
            throw new TypeError(`Shared character "${id}" is unavailable in this catalog.`);
        }
    }
    const dimensions = Object.fromEntries(SCORE_KEYS.map((key, index) => [key, compact.d[index]]));
    const matches = rankCharacters(dimensions, catalog.map((match) => ({
        ...match, scores: match.dimensions
    }))).map(({ id, matchScore }) => ({ ...catalogById.get(id), score: matchScore }));

    return normalizeResult({
        title: "A shared character profile",
        mode: compact.mode ?? "full",
        example: compact.example ?? false,
        dimensions,
        matches
    });
}

/**
 * Explain a match using the user's most pronounced dimension and the two
 * dimensions closest to the character profile.
 *
 * @param {UHCIScores} userScores
 * @param {CharacterMatch} match
 * @returns {string}
 */
export function buildMatchExplanation(userScores, match) {
    const strongestKey = [...SCORE_KEYS].sort((first, second) => (
        Math.abs(userScores[second] - 5.5) - Math.abs(userScores[first] - 5.5)
    ))[0];
    const closestKeys = [...SCORE_KEYS]
        .sort((first, second) => (
            Math.abs(userScores[first] - match.dimensions[first])
            - Math.abs(userScores[second] - match.dimensions[second])
        ))
        .slice(0, 2);
    const strongestDimension = DIMENSIONS[strongestKey];
    const strongestPole = userScores[strongestKey] >= 5.5
        ? strongestDimension.high
        : strongestDimension.low;
    const closestNames = closestKeys.map((key) => DIMENSIONS[key].name);

    const emphasis = Math.abs(userScores[strongestKey] - 5.5) < 1
        ? "Your profile sits near the middle of all six spectra."
        : `Your most distinctive dimension is ${strongestDimension.name}, leaning toward ${strongestPole.toLowerCase()}.`;
    return `${emphasis} `
        + `${match.name} is especially close to you on ${closestNames[0]} and ${closestNames[1]}.`;
}

function element(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

function svgElement(tagName, attributes = {}) {
    const node = document.createElementNS(SVG_NAMESPACE, tagName);
    Object.entries(attributes).forEach(([name, value]) => {
        node.setAttribute(name, String(value));
    });
    return node;
}

function scoreLabel(score) {
    if (score >= 90) {
        return "Exceptional match";
    }
    if (score >= 80) {
        return "Strong match";
    }
    if (score >= 70) {
        return "Good match";
    }
    return "Interesting match";
}

function createCharacterImage(match, featured = false) {
    const frame = element("div", featured ? "character-frame character-frame--featured" : "character-frame");
    if (match.image) {
        const image = document.createElement("img");
        image.className = "character-image";
        image.src = match.image;
        image.alt = "";
        image.loading = featured ? "eager" : "lazy";
        frame.append(image);
    } else {
        const initials = match.name.split(/\s+/u).slice(0, 2).map((word) => word[0]).join("");
        frame.append(element("span", "character-initials", initials));
    }
    return frame;
}

function createMatchScore(match) {
    const wrapper = element("div", "match-score");
    const text = element("p", "match-score__text");
    const strong = element("strong", "", `${match.score.toFixed(1)}%`);
    text.append(strong, document.createTextNode(` profile similarity · ${scoreLabel(match.score)}`));
    const meter = document.createElement("meter");
    meter.className = "match-meter";
    meter.min = 0;
    meter.max = 100;
    meter.value = match.score;
    meter.setAttribute("aria-label", `${match.name} profile similarity`);
    meter.textContent = `${match.score.toFixed(1)}%`;
    wrapper.append(text, meter);
    return wrapper;
}

function createHero(result) {
    const bestMatch = result.matches[0];
    const hero = element("section", "hero-card");
    hero.setAttribute("aria-labelledby", "result-heading");

    const copy = element("div", "hero-copy");
    copy.append(
        element("p", "eyebrow", result.example ? "Example match" : result.mode === "quick" ? "Your provisional match" : "Your best match"),
        element("h1", "hero-title", bestMatch.name)
    );
    copy.querySelector("h1").id = "result-heading";
    copy.querySelector("h1").tabIndex = -1;
    copy.append(
        createMatchScore(bestMatch),
        element("p", "hero-description", bestMatch.description),
        element("p", "match-explanation", buildMatchExplanation(result.dimensions, bestMatch))
    );

    hero.append(copy, createCharacterImage(bestMatch, true));
    return hero;
}

function polarPoint(index, value, radius, center) {
    const angle = ((Math.PI * 2) / SCORE_KEYS.length) * index - (Math.PI / 2);
    const scaledRadius = radius * value;
    return {
        x: center + Math.cos(angle) * scaledRadius,
        y: center + Math.sin(angle) * scaledRadius
    };
}

function pointsAttribute(values, radius, center) {
    return values.map((value, index) => {
        const point = polarPoint(index, value, radius, center);
        return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }).join(" ");
}

function createRadarChart(scores, comparison) {
    const figure = element("figure", "profile-chart");
    const chartTitleId = "profile-chart-title";
    const chartDescriptionId = "profile-chart-description";
    const svg = svgElement("svg", {
        class: "radar-chart",
        viewBox: "0 0 360 360",
        role: "img",
        "aria-labelledby": `${chartTitleId} ${chartDescriptionId}`
    });
    const title = svgElement("title", { id: chartTitleId });
    title.textContent = "Six-axis UHCI personality profile";
    const description = svgElement("desc", { id: chartDescriptionId });
    description.textContent = SCORE_KEYS
        .map((key) => `${DIMENSIONS[key].name}: you ${scores[key]}, ${comparison.name} ${comparison.dimensions[key]}, out of 10`)
        .join("; ");
    svg.append(title, description);

    const center = 180;
    const radius = 112;
    [1, 4, 7, 10].forEach((score) => {
        svg.append(svgElement("polygon", {
            class: "radar-grid",
            points: pointsAttribute(SCORE_KEYS.map(() => score / 10), radius, center)
        }));
        const tick = svgElement("text", {
            class: "radar-tick", x: center + 7, y: center - radius * score / 10 + 4
        });
        tick.textContent = score;
        svg.append(tick);
    });

    SCORE_KEYS.forEach((key, index) => {
        const outerPoint = polarPoint(index, 1, radius, center);
        svg.append(svgElement("line", {
            class: "radar-axis",
            x1: center,
            y1: center,
            x2: outerPoint.x,
            y2: outerPoint.y
        }));

        const labelPoint = polarPoint(index, 1.33, radius, center);
        const label = svgElement("text", {
            class: "radar-label",
            x: labelPoint.x,
            y: labelPoint.y,
            "text-anchor": Math.abs(labelPoint.x - center) < 10
                ? "middle"
                : labelPoint.x > center ? "start" : "end",
            "dominant-baseline": "middle"
        });
        label.textContent = key;
        svg.append(label);
    });

    svg.append(svgElement("polygon", {
        class: "radar-comparison",
        points: pointsAttribute(SCORE_KEYS.map((key) => comparison.dimensions[key] / 10), radius, center)
    }));
    const values = SCORE_KEYS.map((key) => scores[key] / 10);
    svg.append(svgElement("polygon", {
        class: "radar-profile",
        points: pointsAttribute(values, radius, center)
    }));
    values.forEach((value, index) => {
        const point = polarPoint(index, value, radius, center);
        svg.append(svgElement("circle", {
            class: "radar-point",
            cx: point.x,
            cy: point.y,
            r: 4
        }));
    });

    const caption = element("figcaption", "chart-caption", "Scores run from 1 near the center to 10 at the outer ring. A larger shape is not a better personality.");
    figure.append(svg, caption);
    return figure;
}

function createScoresTable(scores, comparison) {
    const details = element("details", "score-details");
    details.append(element("summary", "", "View scores as a table"));
    const tableWrapper = element("div", "table-scroll");
    const table = element("table", "score-table");
    const caption = element("caption", "", "Text equivalent of the UHCI personality visualization");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Dimension", "You", comparison.name, "Difference", "Scale"].forEach((label) => {
        const cell = element("th", "", label);
        cell.scope = "col";
        headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    SCORE_KEYS.forEach((key) => {
        const row = document.createElement("tr");
        const nameCell = element("th", "", `${DIMENSIONS[key].name} (${key})`);
        nameCell.scope = "row";
        row.append(
            nameCell,
            element("td", "score-value", `${dimensionScore(scores[key])} / 10`),
            element("td", "score-value", `${dimensionScore(comparison.dimensions[key])} / 10`),
            element("td", "score-value", differenceLabel(scores[key] - comparison.dimensions[key])),
            element("td", "", `${DIMENSIONS[key].low} to ${DIMENSIONS[key].high}`)
        );
        body.append(row);
    });
    table.append(caption, head, body);
    tableWrapper.append(table);
    details.append(tableWrapper);
    return details;
}

function dimensionScore(score) {
    return score.toFixed(2).replace(/0$/u, "");
}

function differenceLabel(difference) {
    if (difference === 0) {
        return "Same score";
    }
    if (Math.abs(difference) < 0.005) {
        return "Less than 0.01 apart";
    }
    return `${dimensionScore(Math.abs(difference))} ${difference > 0 ? "higher" : "lower"}`;
}

function createDimensionSpectra(scores, comparison) {
    const list = element("div", "dimension-list");
    SCORE_KEYS.forEach((key) => {
        const dimension = DIMENSIONS[key];
        const item = element("section", "dimension-item");
        item.append(
            element("h3", "", `${dimension.name} (${key})`),
            element("p", "dimension-description", dimension.description)
        );
        const anchors = element("div", "spectrum-anchors");
        anchors.append(element("span", "", `1 · ${dimension.low}`), element("span", "", `${dimension.high} · 10`));
        const track = element("div", "spectrum-track");
        track.setAttribute("aria-hidden", "true");
        const userMarker = element("span", "spectrum-marker spectrum-marker--you");
        userMarker.style.left = `${(scores[key] - 1) / 9 * 100}%`;
        const comparisonMarker = element("span", "spectrum-marker spectrum-marker--character");
        comparisonMarker.style.left = `${(comparison.dimensions[key] - 1) / 9 * 100}%`;
        track.append(userMarker, comparisonMarker);
        const numbers = element("p", "spectrum-values",
            `You ${dimensionScore(scores[key])} / ${comparison.name} ${dimensionScore(comparison.dimensions[key])}`);
        item.append(anchors, track, numbers,
            element("p", "spectrum-difference", differenceLabel(scores[key] - comparison.dimensions[key])));
        list.append(item);
    });
    return list;
}

function createProfileSection(result) {
    const section = element("section", "content-card profile-section");
    section.setAttribute("aria-labelledby", "profile-heading");
    const headingGroup = element("div", "section-heading");
    const heading = element("h2", "", "Your personality shape");
    heading.id = "profile-heading";
    headingGroup.append(
        heading,
        element("p", "", "Compare your pattern with any of the 15 characters. Both ends of each spectrum are valid; higher is not better.")
    );
    const controls = element("div", "comparison-controls");
    const label = element("label", "", "Compare your profile with");
    label.htmlFor = "compare-character";
    const select = element("select", "comparison-select");
    select.id = "compare-character";
    result.matches.forEach((match) => {
        const option = element("option", "", `${match.name} (${match.score.toFixed(1)}% similarity)`);
        option.value = match.id;
        select.append(option);
    });
    const legend = element("div", "chart-legend");
    const youKey = element("span", "legend-you", "You · solid line / circle");
    const characterKey = element("span", "legend-character");
    legend.append(youKey, characterKey);
    const status = element("p", "comparison-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    controls.append(label, select, legend, status);
    const layout = element("div", "profile-layout");
    const chartBlock = element("div", "chart-block");
    const spectra = element("div", "spectra");
    layout.append(chartBlock, spectra);
    const update = (id, announce = false) => {
        const match = result.matches.find((entry) => entry.id === id);
        select.value = id;
        const tableWasOpen = chartBlock.querySelector("details")?.open ?? false;
        const table = createScoresTable(result.dimensions, match);
        table.open = tableWasOpen;
        chartBlock.replaceChildren(createRadarChart(result.dimensions, match), table);
        spectra.replaceChildren(createDimensionSpectra(result.dimensions, match));
        characterKey.textContent = `${match.name} · dashed line / diamond`;
        status.textContent = announce ? `Now comparing your profile with ${match.name}.` : "";
    };
    select.addEventListener("change", () => update(select.value, true));
    update(result.matches[0].id);
    section.append(headingGroup, controls, layout);
    return {
        section,
        compare(id) {
            update(id, true);
            select.focus({ preventScroll: true });
            section.scrollIntoView({ block: "start" });
        }
    };
}

function createTopMatches(result, compare) {
    const section = element("section", "matches-section");
    section.setAttribute("aria-labelledby", "matches-heading");
    const headingGroup = element("div", "section-heading");
    const heading = element("h2", "", "Your top three");
    heading.id = "matches-heading";
    headingGroup.append(
        heading,
        element("p", "", "These are your closest personality patterns, not probabilities. Small differences can make neighboring matches nearly tied.")
    );
    const list = element("ol", "match-grid");
    result.matches.slice(0, 3).forEach((match, index) => {
        const item = element("li", "match-card");
        const rank = element("span", "match-rank", `#${index + 1}`);
        item.append(
            rank,
            createCharacterImage(match),
            element("h3", "", match.name),
            createMatchScore(match),
            element("p", "match-card__description", match.description),
            element("p", "match-card__why", buildMatchExplanation(result.dimensions, match))
        );
        const button = element("button", "button button--secondary compare-button", `Compare with ${match.name}`);
        button.type = "button";
        button.addEventListener("click", () => compare(match.id));
        item.append(button);
        list.append(item);
    });
    section.append(headingGroup, list);
    return section;
}

export function createShareUrl(result, currentHref = window.location.href) {
    const url = new URL("results.html", currentHref);
    url.username = "";
    url.password = "";
    url.hash = new URLSearchParams({ result: encodeResult(result) }).toString();
    return url.toString();
}

export const createResultUrl = createShareUrl;

async function copyShareUrl(url, field, status) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(url);
            status.textContent = "Link copied. It is ready to share.";
            return;
        } catch {
            // Continue to the selection-based fallback below.
        }
    }

    field.focus();
    field.select();
    try {
        if (typeof document.execCommand === "function" && document.execCommand("copy")) {
            status.textContent = "Link copied using your browser's fallback.";
            return;
        }
    } catch {
        // The selected field remains available for manual copying.
    }
    status.textContent = "Automatic copying is unavailable. The link is selected; press Command+C or Control+C.";
}

function createShareSection(result, { characterOnly = false, shared = false } = {}) {
    const bestMatch = result.matches?.[0] ?? result;
    const section = element("section", "content-card share-card");
    section.setAttribute("aria-labelledby", "share-heading");
    const heading = element("h2", "", "Share this result");
    heading.id = "share-heading";
    const intro = element("p", "",
        "By default, sharing includes only the character, not your scores or answers. Downloaded cards also contain only the character.");
    const detailLabel = element("label", "share-opt-in");
    const detailToggle = document.createElement("input");
    detailToggle.type = "checkbox";
    detailToggle.id = "share-profile";
    detailLabel.append(detailToggle, document.createTextNode(
        "Include my full six-score profile in the link. Anyone with the link can see these dimension scores; individual answers are never included."
    ));
    let shareUrl = createCharacterShareUrl(bestMatch);
    const controls = element("div", "share-controls");
    const copyButton = element("button", "button button--primary", "Copy link");
    copyButton.type = "button";
    const shareButton = element("button", "button button--secondary", "Share...");
    shareButton.type = "button";
    shareButton.hidden = typeof navigator.share !== "function";
    const downloadButton = element("button", "button button--secondary", "Download character card");
    downloadButton.type = "button";
    controls.append(copyButton, shareButton, downloadButton);

    const fieldLabel = element("label", "share-label", "Shareable result link");
    fieldLabel.htmlFor = "share-url";
    const field = document.createElement("input");
    field.id = "share-url";
    field.className = "share-url";
    field.type = "url";
    field.readOnly = true;
    field.value = shareUrl;
    field.spellcheck = false;
    const status = element("p", "share-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");

    detailToggle.addEventListener("change", () => {
        shareUrl = detailToggle.checked ? createResultUrl(result) : createCharacterShareUrl(bestMatch);
        field.value = shareUrl;
        status.textContent = detailToggle.checked
            ? "Detailed sharing enabled. This link includes all six dimension scores."
            : "Character-only sharing enabled. Your scores are not included.";
    });
    copyButton.addEventListener("click", () => {
        copyShareUrl(shareUrl, field, status);
    });
    shareButton.addEventListener("click", async () => {
        try {
            await navigator.share({
                title: `${bestMatch.name} character match`,
                text: result.example
                    ? `Explore an example ${bestMatch.name} character match.`
                    : shared
                        ? `Meet ${bestMatch.name} and find your own character.`
                        : `My ${result.mode === "quick" ? "provisional " : ""}character match is ${bestMatch.name}.`,
                url: shareUrl
            });
            status.textContent = "Share sheet opened successfully.";
        } catch (error) {
            if (error.name !== "AbortError") {
                status.textContent = "Sharing was unavailable. You can still copy the link below.";
                field.focus();
            }
        }
    });
    downloadButton.addEventListener("click", async () => {
        downloadButton.disabled = true;
        status.textContent = "Preparing your character card...";
        try {
            await downloadResultCard(result, {
                mode: result.example ? "example" : shared ? "shared" : result.mode ?? "full"
            });
            status.textContent = "Character card download started. No scores or answers are included.";
        } catch (error) {
            status.textContent = `The card could not be downloaded. ${error.message} You can still copy the character link.`;
        } finally {
            downloadButton.disabled = false;
        }
    });
    section.append(heading, intro);
    if (!characterOnly) {
        section.append(detailLabel);
    }
    section.append(controls, fieldLabel, field, status);
    return section;
}

function createAllMatches(result, compare) {
    const section = element("details", "content-card all-matches");
    section.append(element("summary", "", `Explore all ${result.matches.length} character matches`));
    const list = element("ol", "ranking-list");
    result.matches.forEach((match) => {
        const item = element("li", "ranking-item");
        const button = element("button", "ranking-button");
        button.type = "button";
        button.setAttribute("aria-label", `Compare with ${match.name}, ${match.score.toFixed(1)}% similarity`);
        const bar = element("span", "ranking-bar");
        bar.style.width = `${match.score}%`;
        bar.setAttribute("aria-hidden", "true");
        button.append(
            bar, element("span", "ranking-name", match.name),
            element("strong", "", `${match.score.toFixed(1)}%`)
        );
        button.addEventListener("click", () => compare(match.id));
        item.append(button);
        list.append(item);
    });
    section.append(element("p", "", "Select a character to compare their profile with yours."), list);
    return section;
}

function createMethodSection(mode) {
    const section = element("section", "content-card method-card");
    const heading = element("h2", "", "How to read your profile");
    section.append(heading,
        element("p", "", mode === "quick"
            ? "This provisional profile uses one answer per dimension on a 1–10 scale. Answer more questions to refine the pattern. Reverse-worded items are flipped, and every dimension contributes equally to your match."
            : "Each dimension averages five answers on a 1–10 scale. Reverse-worded items are flipped before averaging. Every dimension contributes equally to your match."),
        element("p", "", "Similarity is 100 × (1 − distance / (9 × √6)), using Euclidean distance across the six scores. 100% means identical profiles; 0% means opposite scale extremes. Rankings use unrounded distances; percentages are displayed to one decimal. Exact ties use character IDs in alphabetical order."),
        element("p", "", "This fan-made inventory is for fun and reflection, not a validated psychological test or diagnosis. Character baselines are interpretations, not measurements of real people. A bigger radar shape or a higher score is not better.")
    );
    return section;
}

/**
 * Render a complete result experience into a container.
 *
 * @param {HTMLElement} root
 * @param {CharacterResult} input
 * @param {{mode?: "quick"|"full", quizUrl?: string, onRefine?: function, onRetake?: function}} [options]
 * @returns {CharacterResult} The validated and ranked result
 */
export function renderResults(root, input, options = {}) {
    if (!(root instanceof HTMLElement)) {
        throw new TypeError("renderResults requires an HTMLElement root.");
    }
    const result = normalizeResult({ ...input, mode: options.mode ?? input.mode });
    const profile = createProfileSection(result);
    const fragment = document.createDocumentFragment();
    const pageIntro = element("div", "page-intro");
    pageIntro.append(
        element("p", "eyebrow", "Unified Henson Character Inventory"),
        element("p", "page-kicker", result.title),
        element("p", "result-depth", result.example
            ? "Example profile · sample scores, not your results"
            : result.mode === "quick"
                ? "Quick match · 6 answers · provisional profile"
                : "Full profile · 30 answers")
    );
    const nextSteps = element("nav", "result-actions");
    nextSteps.setAttribute("aria-label", "Continue your quiz");
    const quizUrl = options.quizUrl ?? "muppets.html";
    if (result.mode === "quick" && !result.example) {
        const refine = element(options.onRefine ? "button" : "a", "button button--primary",
            options.onRefine ? "Go deeper" : "Take your own full quiz");
        if (options.onRefine) {
            refine.type = "button";
            refine.addEventListener("click", options.onRefine);
        } else {
            const fullQuizUrl = new URL(quizUrl, window.location.href);
            fullQuizUrl.searchParams.set("mode", "full");
            fullQuizUrl.hash = "";
            refine.href = fullQuizUrl.href;
        }
        nextSteps.append(refine, element("p", "", options.onRefine
            ? "24 more questions. Your first six answers stay with you."
            : "Six answers are a starting point, not a fixed label."));
    }
    const retake = element(options.onRetake ? "button" : "a", "button button--secondary",
        result.example ? "Find my character" : "Take the quiz again");
    if (options.onRetake) {
        retake.type = "button";
        retake.addEventListener("click", options.onRetake);
    } else {
        retake.href = quizUrl;
    }
    nextSteps.append(retake);
    fragment.append(
        pageIntro,
        createHero(result),
        nextSteps,
        profile.section,
        createTopMatches(result, profile.compare),
        createAllMatches(result, profile.compare),
        createMethodSection(result.mode),
        createShareSection(result)
    );
    root.replaceChildren(fragment);
    return result;
}

export function renderCharacterResult(root, character, options = {}) {
    if (!(root instanceof HTMLElement) || !character?.id || !character?.name) {
        throw new TypeError("A result container and known character are required.");
    }
    const intro = element("p", "load-notice", options.shared
        ? "A shared character — this is not your quiz result and contains no personal scores."
        : "Your Sesame Street character match — a playful match, not a six-dimensional personality assessment.");
    const card = element("section", "hero-card");
    card.setAttribute("aria-labelledby", "result-heading");
    const copy = element("div", "hero-copy");
    const heading = element("h1", "hero-title", character.name);
    heading.id = "result-heading";
    heading.tabIndex = -1;
    copy.append(element("p", "eyebrow", options.shared ? "Meet the character" : "Your character match"), heading,
        element("p", "hero-description", character.description));
    card.append(copy, createCharacterImage(character, true));
    const action = element(options.onRetake ? "button" : "a", "button button--primary",
        options.shared ? "Find my character" : "Take the quiz again");
    if (options.onRetake) {
        action.type = "button";
        action.addEventListener("click", options.onRetake);
    } else {
        action.href = options.quizUrl ?? (character.universe === "sesame-street" ? "sesame-street.html" : "muppets.html");
    }
    const nextSteps = element("div", "result-actions");
    nextSteps.append(action);
    root.replaceChildren(intro, card, nextSteps, createShareSection(character, { characterOnly: true, shared: options.shared }));
}

/**
 * Dependency-free assertions for the compact encoding and decoding helpers.
 * Throws immediately if a helper stops preserving the six scores or rankings.
 *
 * @returns {true}
 */
export function runSelfTests() {
    const dimensions = { ED: 8.2, EC: 6.4, SA: 9.1, RL: 5.5, SH: 4.3, BS: 7.8 };
    const matches = ["alpha", "beta", "gamma"].map((id, index) => ({
        id,
        name: `Character ${index + 1}`,
        score: 91 - (index * 4),
        dimensions
    }));
    const encoded = encodeResult({ dimensions, matches });
    const decoded = decodeResult(encoded);
    const expectedDimensions = SCORE_KEYS.map((key) => dimensions[key]);

    if (JSON.stringify(decoded.d) !== JSON.stringify(expectedDimensions)) {
        throw new Error("Result encoding assertion failed: dimension scores changed.");
    }
    if (decoded.v !== 2 || decoded.c !== "muppets-1" || "m" in decoded) {
        throw new Error("Result encoding assertion failed: unexpected shared payload.");
    }
    if (encodeResult({ dimensions, matches }) !== encoded) {
        throw new Error("Result encoding assertion failed: output is not deterministic.");
    }
    let rejectedInvalidPayload = false;
    try {
        decodeResult("not-a-valid-result");
    } catch {
        rejectedInvalidPayload = true;
    }
    if (!rejectedInvalidPayload) {
        throw new Error("Result decoding assertion failed: invalid data was accepted.");
    }
    return true;
}
