const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SCORE_KEYS = ["ED", "EC", "SA", "RL", "SH", "BS"];

export const DIMENSIONS = Object.freeze({
    ED: {
        name: "Event Drive",
        low: "reactive",
        high: "agentic",
        description: "How readily you initiate and steer events"
    },
    EC: {
        name: "Emotional Containment",
        low: "expressive",
        high: "regulated",
        description: "How tightly you contain emotional reactions"
    },
    SA: {
        name: "Social Aim",
        low: "self-directed",
        high: "communal",
        description: "How strongly you prioritize shared wellbeing"
    },
    RL: {
        name: "Reality Lens",
        low: "literal",
        high: "surreal",
        description: "How readily you embrace absurd or playful logic"
    },
    SH: {
        name: "Show-Awareness",
        low: "immersed",
        high: "performative",
        description: "How aware you are of presentation and audience"
    },
    BS: {
        name: "Behavioral Stability",
        low: "volatile",
        high: "steady",
        description: "How consistent your behavior is across situations"
    }
});

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
        return [key, Math.round(value * 10) / 10];
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
            score: Math.round(match.score),
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
 * Encode only non-sensitive scores and stable character ids for a compact URL.
 * Names, descriptions, and image paths remain in the local character catalog.
 *
 * @param {CharacterResult} input
 * @returns {string}
 */
export function encodeResult(input) {
    const result = normalizeResult(input);
    const compact = {
        v: 1,
        d: SCORE_KEYS.map((key) => result.dimensions[key]),
        m: result.matches.slice(0, 3).map((match) => [match.id, match.score])
    };
    return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(compact)));
}

/**
 * Decode and validate compact URL data. The returned object intentionally
 * contains ids and scores only and must be hydrated from a trusted catalog.
 *
 * @param {string} encoded
 * @returns {{v: 1, d: number[], m: Array<[string, number]>}}
 */
export function decodeResult(encoded) {
    let compact;
    try {
        compact = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
    } catch (error) {
        throw new TypeError("Shared result could not be decoded.", { cause: error });
    }

    if (!compact || compact.v !== 1 || !Array.isArray(compact.d) || compact.d.length !== SCORE_KEYS.length) {
        throw new TypeError("Shared result uses an unsupported format.");
    }
    compact.d.forEach((score, index) => {
        assertNumberInRange(score, 1, 10, `shared dimension ${index + 1}`);
    });
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
 * @param {{v: 1, d: number[], m: Array<[string, number]>}} compact
 * @param {CharacterMatch[]} catalog
 * @returns {CharacterResult}
 */
export function hydrateSharedResult(compact, catalog) {
    const catalogById = new Map(catalog.map((match) => [match.id, match]));
    const matches = compact.m.map(([id, score]) => {
        const catalogMatch = catalogById.get(id);
        if (!catalogMatch) {
            throw new TypeError(`Shared character "${id}" is unavailable in this catalog.`);
        }
        return { ...catalogMatch, score };
    });

    return normalizeResult({
        title: "A shared character profile",
        dimensions: Object.fromEntries(SCORE_KEYS.map((key, index) => [key, compact.d[index]])),
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

    return `Your pronounced ${strongestPole} ${strongestDimension.name.toLowerCase()} stands out. `
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
    const strong = element("strong", "", `${match.score}%`);
    text.append(strong, document.createTextNode(` profile similarity · ${scoreLabel(match.score)}`));
    const meter = document.createElement("meter");
    meter.className = "match-meter";
    meter.min = 0;
    meter.max = 100;
    meter.value = match.score;
    meter.textContent = `${match.score}%`;
    wrapper.append(text, meter);
    return wrapper;
}

function createHero(result) {
    const bestMatch = result.matches[0];
    const hero = element("section", "hero-card");
    hero.setAttribute("aria-labelledby", "result-heading");

    const copy = element("div", "hero-copy");
    copy.append(
        element("p", "eyebrow", "Your best match"),
        element("h1", "hero-title", bestMatch.name)
    );
    copy.querySelector("h1").id = "result-heading";
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

function createRadarChart(scores) {
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
        .map((key) => `${DIMENSIONS[key].name}: ${scores[key]} out of 10`)
        .join("; ");
    svg.append(title, description);

    const center = 180;
    const radius = 112;
    [0.2, 0.4, 0.6, 0.8, 1].forEach((level) => {
        svg.append(svgElement("polygon", {
            class: "radar-grid",
            points: pointsAttribute(SCORE_KEYS.map(() => level), radius, center)
        }));
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

    const caption = element("figcaption", "chart-caption", "Your six UHCI dimension scores");
    figure.append(svg, caption);
    return figure;
}

function createScoresTable(scores) {
    const details = element("details", "score-details");
    details.append(element("summary", "", "View scores as a table"));
    const tableWrapper = element("div", "table-scroll");
    const table = element("table", "score-table");
    const caption = element("caption", "", "Text equivalent of the UHCI personality visualization");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Dimension", "Score", "Scale"].forEach((label) => {
        headRow.append(element("th", "", label));
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    SCORE_KEYS.forEach((key) => {
        const row = document.createElement("tr");
        const nameCell = element("th", "", `${DIMENSIONS[key].name} (${key})`);
        nameCell.scope = "row";
        row.append(
            nameCell,
            element("td", "score-value", `${scores[key]} / 10`),
            element("td", "", `${DIMENSIONS[key].low} to ${DIMENSIONS[key].high}`)
        );
        body.append(row);
    });
    table.append(caption, head, body);
    tableWrapper.append(table);
    details.append(tableWrapper);
    return details;
}

function createProfileSection(result) {
    const section = element("section", "content-card profile-section");
    section.setAttribute("aria-labelledby", "profile-heading");
    const headingGroup = element("div", "section-heading");
    const heading = element("h2", "", "Your personality shape");
    heading.id = "profile-heading";
    headingGroup.append(
        heading,
        element("p", "", "A six-dimensional view of how you tend to move through the world.")
    );
    const layout = element("div", "profile-layout");
    const definitions = element("dl", "dimension-list");
    SCORE_KEYS.forEach((key) => {
        const item = element("div", "dimension-item");
        const term = document.createElement("dt");
        term.append(
            element("span", "dimension-code", key),
            document.createTextNode(DIMENSIONS[key].name)
        );
        const definition = element("dd", "", DIMENSIONS[key].description);
        item.append(term, definition);
        definitions.append(item);
    });
    const chartBlock = element("div", "chart-block");
    chartBlock.append(createRadarChart(result.dimensions), createScoresTable(result.dimensions));
    layout.append(chartBlock, definitions);
    section.append(headingGroup, layout);
    return section;
}

function createTopMatches(result) {
    const section = element("section", "matches-section");
    section.setAttribute("aria-labelledby", "matches-heading");
    const headingGroup = element("div", "section-heading");
    const heading = element("h2", "", "Your top three");
    heading.id = "matches-heading";
    headingGroup.append(
        heading,
        element("p", "", "Similarity compares your six UHCI scores with each character profile.")
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
        list.append(item);
    });
    section.append(headingGroup, list);
    return section;
}

function createShareUrl(result, currentHref = window.location.href) {
    const url = new URL(currentHref);
    url.hash = new URLSearchParams({ result: encodeResult(result) }).toString();
    return url.toString();
}

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

function createShareSection(result) {
    const section = element("section", "content-card share-card");
    section.setAttribute("aria-labelledby", "share-heading");
    const heading = element("h2", "", "Share this result");
    heading.id = "share-heading";
    const intro = element(
        "p",
        "",
        "The link contains only six scores and three character ids with match percentages."
    );
    const shareUrl = createShareUrl(result);
    const controls = element("div", "share-controls");
    const copyButton = element("button", "button button--primary", "Copy link");
    copyButton.type = "button";
    const shareButton = element("button", "button button--secondary", "Share...");
    shareButton.type = "button";
    shareButton.hidden = typeof navigator.share !== "function";
    controls.append(copyButton, shareButton);

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

    copyButton.addEventListener("click", () => {
        copyShareUrl(shareUrl, field, status);
    });
    shareButton.addEventListener("click", async () => {
        try {
            await navigator.share({
                title: `${result.matches[0].name} character match`,
                text: `My best character match is ${result.matches[0].name} at ${result.matches[0].score}%.`,
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

    section.append(heading, intro, controls, fieldLabel, field, status);
    return section;
}

/**
 * Render a complete result experience into a container.
 *
 * @param {HTMLElement} root
 * @param {CharacterResult} input
 * @returns {CharacterResult} The validated and ranked result
 */
export function renderResults(root, input) {
    if (!(root instanceof HTMLElement)) {
        throw new TypeError("renderResults requires an HTMLElement root.");
    }
    const result = normalizeResult(input);
    const fragment = document.createDocumentFragment();
    const pageIntro = element("div", "page-intro");
    pageIntro.append(
        element("p", "eyebrow", "Unified Henson Character Inventory"),
        element("p", "page-kicker", result.title)
    );
    fragment.append(
        pageIntro,
        createHero(result),
        createProfileSection(result),
        createTopMatches(result),
        createShareSection(result)
    );
    root.replaceChildren(fragment);
    return result;
}

function readFixture() {
    const fixture = document.querySelector("#result-fixture");
    if (!fixture) {
        throw new Error("The result fixture is missing.");
    }
    return normalizeResult(JSON.parse(fixture.textContent));
}

function readSharedResult(fixture) {
    const encoded = new URLSearchParams(window.location.hash.slice(1)).get("result");
    if (!encoded) {
        return { result: fixture, message: "" };
    }
    try {
        return {
            result: hydrateSharedResult(decodeResult(encoded), fixture.matches),
            message: "Shared result loaded."
        };
    } catch {
        return {
            result: fixture,
            message: "This shared link could not be read, so the sample result is shown instead."
        };
    }
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
    if (decoded.m.map(([id]) => id).join(",") !== "alpha,beta,gamma") {
        throw new Error("Result encoding assertion failed: match ranking changed.");
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

runSelfTests();

if (typeof document !== "undefined") {
    const root = document.querySelector("[data-results-root]");
    const loading = document.querySelector("[data-loading]");
    try {
        const fixture = readFixture();
        const shared = readSharedResult(fixture);
        renderResults(root, shared.result);
        if (shared.message) {
            const notice = element("p", "load-notice", shared.message);
            notice.setAttribute("role", "status");
            notice.setAttribute("aria-live", "polite");
            root.prepend(notice);
        }
    } catch (error) {
        const failure = element("section", "notice-card");
        failure.append(
            element("h1", "", "The result could not be displayed"),
            element("p", "", error instanceof Error ? error.message : "An unknown error occurred.")
        );
        root.replaceChildren(failure);
    } finally {
        loading?.remove();
    }
}
