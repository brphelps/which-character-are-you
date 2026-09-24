import assert from "node:assert/strict";
import test from "node:test";
import { createCharacterShareUrl, downloadResultCard } from "../js/result-sharing.js";

const character = {
    id: "kermit",
    name: "Kermit the Frog",
    image: "images/kermit.jpg",
    description: "Keeps the show moving, one scene at a time."
};
const currentHref = "https://example.com/which-character-are-you/muppets.html";

test("sharing modules can be imported without a DOM, fixture, storage, or location", async () => {
    const sharing = await import("../js/result-sharing.js");
    assert.equal(typeof sharing.createCharacterShareUrl, "function");
    await assert.rejects(() => sharing.downloadResultCard(character, { currentHref }), /require a browser/u);
});

test("default links reveal only one character ID and preserve the project base path", () => {
    const input = {
        ...character,
        score: 96.92,
        dimensions: { ED: 8, EC: 5, SA: 9, RL: 2, SH: 5, BS: 6 },
        answers: ["private answer"],
        savedState: "private state"
    };
    const link = createCharacterShareUrl(input, `${currentHref}?mode=full&answer=private#result=old-profile`);
    assert.equal(link, "https://example.com/which-character-are-you/results.html?character=kermit");
    assert.deepEqual([...new URL(link).searchParams], [["character", "kermit"]]);
    assert.equal(new URL(link).hash, "");
});

test("links work at root, nested project, directory, recipient, and local-file paths", () => {
    for (const [base, expected] of [
        ["https://example.com/muppets.html", "https://example.com/results.html?character=cookie"],
        ["https://example.com/projects/quiz/sesame-street.html", "https://example.com/projects/quiz/results.html?character=cookie"],
        ["https://example.com/quiz/", "https://example.com/quiz/results.html?character=cookie"],
        ["https://example.com/quiz/results.html?character=oscar", "https://example.com/quiz/results.html?character=cookie"],
        ["file:///offline/quiz/sesame-street.html", "file:///offline/quiz/results.html?character=cookie"]
    ]) {
        assert.equal(createCharacterShareUrl({ id: "cookie" }, base), expected);
    }
});

test("links discard embedded credentials, previous query parameters, and hash payloads", () => {
    assert.equal(
        createCharacterShareUrl(character, "https://name:password@example.com/quiz/?character=elmo&profile=private#private"),
        "https://example.com/quiz/results.html?character=kermit"
    );
});

test("links reject malformed IDs and unsupported bases instead of substituting a sample", () => {
    for (const id of ["", "../kermit", "Kermit", "kermit&scores=9", "kermit?profile=private", "<script>",
        " kermit", "kermit\n", "a".repeat(41), "-kermit", "kermit--frog", "__proto__", null]) {
        assert.throws(() => createCharacterShareUrl({ id }, currentHref), TypeError);
    }
    for (const base of [undefined, "", "not a url", "javascript:alert(1)", "data:text/html,hi", "ftp://example.com/quiz/"]) {
        assert.throws(() => createCharacterShareUrl(character, base), TypeError);
    }
    assert.throws(() => createCharacterShareUrl(null, currentHref), TypeError);
});

function browserDouble(t, { imageFailure = false, emptyImage = false, contextMissing = false,
    blobFailure = false, blobThrows = false, clickThrows = false } = {}) {
    const text = [];
    const paths = [];
    const revoked = [];
    const timers = [];
    const clicks = [];
    const links = [];
    const drawnImages = [];
    const context = {
        beginPath() {}, moveTo() {}, arcTo() {}, closePath() {}, fill() {}, fillRect() {},
        save() {}, arc() {}, clip() {}, restore() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        measureText(value) {
            const size = Number(this.font.match(/(\d+)px/u)?.[1] ?? 20);
            return { width: value.length * size * 0.5 };
        },
        fillText(value, x, y) { text.push({ value, x, y }); },
        drawImage(...args) { drawnImages.push(args); }
    };
    const canvas = {
        getContext: () => contextMissing ? null : context,
        toBlob(callback, type) {
            if (blobThrows) {
                throw new Error("Tainted canvas");
            }
            callback(blobFailure ? null : new Blob(["png"], { type }));
        }
    };
    const document = {
        createElement(tag) {
            if (tag === "canvas") {
                return canvas;
            }
            assert.equal(tag, "a");
            const link = {
                remove() { this.removed = true; },
                click() {
                    if (clickThrows) {
                        throw new Error("Download blocked");
                    }
                    clicks.push(this.download);
                }
            };
            links.push(link);
            return link;
        },
        body: { append(link) { link.appended = true; } }
    };
    class Image {
        naturalWidth = emptyImage ? 0 : 200;
        naturalHeight = emptyImage ? 0 : 300;
        set src(value) {
            paths.push(value);
            queueMicrotask(() => imageFailure ? this.onerror() : this.onload());
        }
    }
    for (const [name, value] of Object.entries({ document, Image })) {
        const original = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        t.after(() => {
            if (original) {
                Object.defineProperty(globalThis, name, original);
            } else {
                delete globalThis[name];
            }
        });
    }
    t.mock.method(globalThis, "setTimeout", (callback, delay) => {
        const timer = { callback, delay };
        timers.push(timer);
        return timer;
    });
    t.mock.method(globalThis, "clearTimeout", (timer) => { timer.cleared = true; });
    t.mock.method(URL, "createObjectURL", () => "blob:local-card");
    t.mock.method(URL, "revokeObjectURL", (url) => revoked.push(url));
    return { text, paths, revoked, timers, clicks, links, drawnImages, canvas };
}

test("earned PNG contains the local portrait, label, disclaimer and credits, but no profile data", async (t) => {
    const browser = browserDouble(t);
    const output = await downloadResultCard({
        title: "private profile title",
        dimensions: { ED: 7.456 },
        matches: [{ ...character, score: 99.876 }]
    }, { currentHref: `${currentHref}?answer=private#saved-state`, mode: "quick" });
    assert.deepEqual(output, {
        filename: "my-kermit-quick-character.png",
        url: "https://example.com/which-character-are-you/results.html?character=kermit"
    });
    assert.equal(browser.canvas.width, 1200);
    assert.equal(browser.canvas.height, 1200);
    assert.deepEqual(browser.paths, ["https://example.com/which-character-are-you/images/kermit.jpg"]);
    assert.equal(browser.drawnImages.length, 1);
    const copy = browser.text.map(({ value }) => value).join("\n");
    assert.match(copy, /QUICK MATCH · PROVISIONAL/u);
    assert.match(copy, /Kermit the\s+Frog/u);
    assert.match(copy, /Not a validated assessment/u);
    assert.match(copy, /https:\/\/example.com\/which-character-are-you\/credits.html/u);
    assert.doesNotMatch(copy, /private|99\.876|7\.456|saved-state|%/u);
    assert.deepEqual(browser.clicks, ["my-kermit-quick-character.png"]);
    assert.equal(browser.links[0].appended, true);
    assert.equal(browser.links[0].removed, true);
    assert.equal(browser.links[0].href, "blob:local-card");
    assert.ok(browser.timers.find(({ delay }) => delay === 10000).cleared);
    assert.deepEqual(browser.revoked, []);
    browser.timers.find(({ delay }) => delay === 60000).callback();
    assert.deepEqual(browser.revoked, ["blob:local-card"]);
});

test("bare Sesame characters download without dimensions, and example/shared modes cannot claim earned results", async (t) => {
    const browser = browserDouble(t);
    const sesame = { id: "cookie", name: "Cookie Monster", image: "images/cookie-monster.jpg" };
    for (const [mode, label, prefix] of [
        ["full", "MY CHARACTER MATCH", "my"],
        ["example", "SAMPLE CHARACTER", "example"],
        ["shared", "SHARED CHARACTER", "shared"]
    ]) {
        const output = await downloadResultCard(sesame, { currentHref, mode });
        assert.equal(output.filename, `${prefix}-cookie-character.png`);
        assert.ok(browser.text.some(({ value }) => value === label));
    }
    assert.match(browser.text.map(({ value }) => value).join("\n"), /not an earned quiz result/u);
    assert.match(browser.text.map(({ value }) => value).join("\n"), /not your own quiz result/u);
});

test("local file cards never embed private filesystem paths", async (t) => {
    const browser = browserDouble(t);
    await downloadResultCard(character, { currentHref: "file:///Users/private-person/quiz/muppets.html" });
    const text = browser.text.map(({ value }) => value).join("\n");
    assert.doesNotMatch(text, /Users|private-person|file:/u);
    assert.match(text, /credits.html/u);
});

test("download rejects external or malformed portraits before performing image requests", async (t) => {
    const browser = browserDouble(t);
    for (const image of ["https://external.example/portrait.jpg", "//external.example/a.jpg",
        "data:image/png;base64,AA", "../images/kermit.jpg", "images/../kermit.jpg",
        "images/kermit.jpg?tracking=1", "images/kermit.jpg#other", ""]) {
        await assert.rejects(() => downloadResultCard({ ...character, image }, { currentHref }), /local character portrait/u);
    }
    assert.deepEqual(browser.paths, []);
    assert.deepEqual(browser.clicks, []);
});

test("invalid cards and modes fail explicitly", async () => {
    for (const input of [null, { matches: [] }, { ...character, name: "" },
        { ...character, description: 12 }, { ...character, description: "x".repeat(501) }]) {
        await assert.rejects(() => downloadResultCard(input, { currentHref }), TypeError);
    }
    await assert.rejects(() => downloadResultCard(character, { currentHref, mode: "mystery" }), /mode/u);
});

for (const [name, options, message] of [
    ["image load", { imageFailure: true }, /portrait could not be loaded/u],
    ["empty image", { emptyImage: true }, /portrait is empty/u],
    ["missing canvas", { contextMissing: true }, /Canvas is unavailable/u],
    ["PNG generation", { blobFailure: true }, /PNG could not be created/u],
    ["tainted canvas", { blobThrows: true }, /portrait could not be exported/u]
]) {
    test(`${name} failure rejects for the caller's accessible status; no fake success download`, async (t) => {
        const browser = browserDouble(t, options);
        await assert.rejects(() => downloadResultCard(character, { currentHref }), message);
        assert.deepEqual(browser.clicks, []);
        assert.equal(browser.links.length, 0);
    });
}

test("blocked downloads still clean up the temporary link and release the blob", async (t) => {
    const browser = browserDouble(t, { clickThrows: true });
    await assert.rejects(() => downloadResultCard(character, { currentHref }), /Download blocked/u);
    assert.equal(browser.links[0].removed, true);
    browser.timers.find(({ delay }) => delay === 60000).callback();
    assert.deepEqual(browser.revoked, ["blob:local-card"]);
});
