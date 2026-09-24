const CHARACTER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LOCAL_PORTRAIT = /^images\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/u;
const CARD_LABELS = Object.freeze({
    quick: "QUICK MATCH · PROVISIONAL",
    full: "MY CHARACTER MATCH",
    example: "SAMPLE CHARACTER",
    shared: "SHARED CHARACTER"
});

function characterId(character) {
    if (!character || typeof character.id !== "string" || character.id.length > 40
        || !CHARACTER_ID.test(character.id)) {
        throw new TypeError("A shareable character needs a valid lowercase identifier.");
    }
    return character.id;
}

/**
 * Share only a character ID. The recipient must resolve it against the trusted
 * production catalog; this helper never serializes a profile or saved answers.
 * Resolves beside the current quiz page, including GitHub Pages project paths.
 */
export function createCharacterShareUrl(character, currentHref = globalThis.location?.href) {
    const id = characterId(character);
    const url = new URL("results.html", currentHref);
    if (!["https:", "http:", "file:"].includes(url.protocol)) {
        throw new TypeError("Character links require an HTTP, HTTPS, or local file URL.");
    }
    url.username = "";
    url.password = "";
    url.search = new URLSearchParams({ character: id }).toString();
    url.hash = "";
    return url.href;
}

function loadPortrait(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const timeout = setTimeout(() => finish(new Error(
            "The portrait took too long to load. Check that local images are available and try again."
        )), 10000);
        function finish(error) {
            clearTimeout(timeout);
            image.onload = null;
            image.onerror = null;
            if (error) {
                reject(error);
            } else {
                resolve(image);
            }
        }
        image.onload = () => {
            finish(image.naturalWidth && image.naturalHeight ? null : new Error(
                "The character portrait is empty. You can still copy the character link."
            ));
        };
        image.onerror = () => finish(new Error(
            "The character portrait could not be loaded. You can still copy the character link."
        ));
        image.src = source;
    });
}

function roundedRectangle(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
    context.fill();
}

function textLines(context, text, width) {
    const words = text.trim().split(/\s+/u);
    const lines = [];
    let line = "";
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > width) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) {
        lines.push(line);
    }
    return lines;
}

function drawText(context, text, { x, y, width, size, minimumSize = size, lineHeight, maxLines, weight = 400 }) {
    let lines;
    do {
        context.font = `${weight} ${size}px system-ui, sans-serif`;
        lines = textLines(context, text, width);
        if (lines.length <= maxLines && lines.every((line) => context.measureText(line).width <= width)) {
            break;
        }
        size -= 2;
    } while (size >= minimumSize);
    if (size < minimumSize) {
        throw new Error("This character's text does not fit the card. You can still copy the character link.");
    }
    lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

function drawCard(context, portrait, character, mode, shareUrl) {
    const width = 1200;
    context.fillStyle = "#f8f5ff";
    context.fillRect(0, 0, width, 1200);
    const gradient = context.createLinearGradient(48, 48, 1152, 1000);
    gradient.addColorStop(0, "#34256f");
    gradient.addColorStop(1, "#7654c4");
    context.fillStyle = gradient;
    roundedRectangle(context, 48, 48, 1104, 964, 40);

    context.fillStyle = "#f2ebff";
    context.font = "700 26px system-ui, sans-serif";
    context.fillText("WHICH CHARACTER ARE YOU?", 100, 120);
    context.fillStyle = "#ffcbad";
    context.font = "700 28px system-ui, sans-serif";
    context.fillText(CARD_LABELS[mode], 100, 207);

    context.fillStyle = "#ffffff";
    drawText(context, character.name, {
        x: 100, y: 326, width: 530, size: 76, minimumSize: 48, lineHeight: 86, maxLines: 3, weight: 800
    });

    context.save();
    context.beginPath();
    context.arc(878, 405, 194, 0, Math.PI * 2);
    context.fillStyle = "#fffdf8";
    context.fill();
    context.clip();
    const scale = Math.min(366 / portrait.naturalWidth, 366 / portrait.naturalHeight);
    const imageWidth = portrait.naturalWidth * scale;
    const imageHeight = portrait.naturalHeight * scale;
    context.drawImage(portrait, 878 - imageWidth / 2, 405 - imageHeight / 2, imageWidth, imageHeight);
    context.restore();

    context.fillStyle = "#ffcbad";
    context.fillRect(100, 647, 80, 6);
    context.fillStyle = "#ffffff";
    drawText(context, character.description || "A little character inspiration for your day.", {
        x: 100, y: 716, width: 990, size: 32, minimumSize: 24, lineHeight: 44, maxLines: 4
    });
    context.fillStyle = "#f2ebff";
    context.font = "500 25px system-ui, sans-serif";
    const note = {
        quick: "A first impression from a shorter quiz. More answers may change it.",
        full: "A playful character resemblance, not a label.",
        example: "A sample to explore, not an earned quiz result.",
        shared: "A friend's character, not your own quiz result."
    }[mode];
    context.fillText(note, 100, 953);

    context.fillStyle = "#3f2c8d";
    context.font = "700 23px system-ui, sans-serif";
    context.fillText("Fan-made entertainment · Not a validated assessment", 80, 1067);

    const url = new URL(shareUrl);
    const creditsUrl = new URL("credits.html", url);
    const localFile = url.protocol === "file:";
    const linkText = localFile ? "Find your character with the quiz included alongside this card."
        : `Find your character: ${url.href}`;
    const creditsText = localFile ? "Portrait sources and licenses: credits.html (included with the quiz)"
        : `Portrait sources and licenses: ${creditsUrl.href}`;
    context.fillStyle = "#514969";
    drawText(context, linkText, {
        x: 80, y: 1106, width: 1040, size: 20, minimumSize: 12, lineHeight: 24, maxLines: 1
    });
    drawText(context, creditsText, {
        x: 80, y: 1145, width: 1040, size: 20, minimumSize: 12, lineHeight: 24, maxLines: 1
    });
}

function pngBlob(canvas) {
    return new Promise((resolve, reject) => {
        if (typeof canvas.toBlob !== "function") {
            reject(new Error("PNG export is not supported by this browser. You can still copy the character link."));
            return;
        }
        try {
            canvas.toBlob((blob) => {
                if (!blob || blob.type !== "image/png") {
                    reject(new Error("The PNG could not be created. You can still copy the character link."));
                } else {
                    resolve(blob);
                }
            }, "image/png");
        } catch (error) {
            reject(new Error("The portrait could not be exported. You can still copy the character link.", { cause: error }));
        }
    });
}

/**
 * Download a 1200x1200 PNG using only the local portrait and browser canvas.
 * Accepts an already-ranked result (matches[0]) or a bare Sesame character.
 * No dimensions, scores, browser storage, answers, or account information appear
 * on the card. Quick cards are visibly provisional; example/shared cards are
 * explicitly labeled as not earned by the viewer. Imports have no side effects.
 *
 * Resolves { filename, url } after requesting a download, where url is the safe
 * character link (not a blob URL). It cannot confirm that a browser saved a file.
 * Rejects with a user-facing Error; the caller must announce it in a live status.
 */
export async function downloadResultCard(result, {
    mode = "full",
    currentHref = globalThis.location?.href
} = {}) {
    const character = result?.matches ? result.matches[0] : result;
    const id = characterId(character);
    if (!Object.hasOwn(CARD_LABELS, mode)) {
        throw new TypeError("A result card mode must be quick, full, example, or shared.");
    }
    if (typeof character.name !== "string" || !character.name.trim()
        || character.name.length > 100 || (character.description !== undefined
            && (typeof character.description !== "string" || character.description.length > 500))) {
        throw new TypeError("A result card needs a character name and a short description.");
    }
    if (typeof character.image !== "string" || !LOCAL_PORTRAIT.test(character.image)) {
        throw new TypeError("A result card needs a local character portrait from images/.");
    }
    const url = createCharacterShareUrl(character, currentHref);
    if (typeof document === "undefined" || typeof Image === "undefined") {
        throw new Error("PNG downloads require a browser. You can still copy the character link.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Canvas is unavailable in this browser. You can still copy the character link.");
    }
    const portrait = await loadPortrait(new URL(character.image, url).href);
    drawCard(context, portrait, character, mode, url);
    const blob = await pngBlob(canvas);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = `${mode === "example" || mode === "shared" ? mode : "my"}-${id}${mode === "quick" ? "-quick" : ""}-character.png`;
    link.href = objectUrl;
    link.download = filename;
    link.hidden = true;
    try {
        document.body.append(link);
        link.click();
    } finally {
        link.remove();
        // Let the browser consume the URL before releasing the image.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
    return { filename, url };
}
