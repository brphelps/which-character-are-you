import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { QuizController, restoreQuizState } from "../js/quiz-controller.js";
import { MUPPET_FULL_QUESTIONS, MUPPET_QUICK_QUESTIONS, FREQUENCY_OPTIONS } from "../data/quiz-content.mjs";

// Small DOM boundary doubles; browser coverage exercises the real radio/focus
// behavior. These keep persistence and transition regression tests dependency-free.
class ElementDouble {
    constructor() {
        this.nodes = new Map();
        this.attributes = new Map();
        this.listeners = new Map();
        this.dataset = {};
        this.events = [];
        this.textContent = "";
        this.innerHTML = "";
        this.hidden = false;
        this.focused = false;
    }
    querySelector(selector) { return this.nodes.get(selector) ?? null; }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    removeEventListener(name) { this.listeners.delete(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    focus() { this.focused = true; }
    dispatchEvent(event) { this.events.push(event); }
    closest() { return this; }
    matches() { return true; }
}

let store;
let originalElement;
let originalStorage;

beforeEach(() => {
    originalElement = globalThis.Element;
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    globalThis.Element = ElementDouble;
    store = new Map();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key) => store.get(key) ?? null,
            setItem: (key, value) => store.set(key, value),
            removeItem: (key) => store.delete(key)
        }
    });
});

afterEach(() => {
    if (originalElement === undefined) delete globalThis.Element;
    else globalThis.Element = originalElement;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
});

function makeController(options = {}) {
    const root = new ElementDouble();
    for (const name of [
        "form", "question", "error", "back", "next", "progress", "step-status", "answered-count",
        "save-status", "reset", "completion", "summary", "restart", "review", "edit"
    ]) {
        root.nodes.set(`[data-quiz-${name}]`, new ElementDouble());
    }
    const question = root.querySelector("[data-quiz-question]");
    question.nodes.set(".question-legend", new ElementDouble());
    question.nodes.set("input[type='radio']", new ElementDouble());
    const controller = new QuizController({
        root,
        questions: MUPPET_QUICK_QUESTIONS,
        questionBank: MUPPET_FULL_QUESTIONS,
        journeyId: "quick",
        storageKey: "test-journey",
        ...options
    });
    return controller;
}

function choose(controller, index = 2) {
    const target = new ElementDouble();
    target.dataset.optionIndex = String(index);
    controller.handleChange({ target });
}

function submit(controller) {
    controller.handleSubmit({ preventDefault() {} });
}

function fill(controller, count) {
    for (let index = 0; index < count; index += 1) {
        choose(controller, index % 5);
        submit(controller);
    }
}

test("progress counts answers, missing-answer error focuses a radio, and completing runs once", () => {
    let completions = 0;
    const controller = makeController({ onComplete() { completions += 1; } });
    assert.equal(controller.elements.progress.value, 0);
    submit(controller);
    assert.equal(controller.currentIndex, 0);
    assert.match(controller.elements.error.textContent, /Choose an answer/);
    assert.equal(controller.elements.question.querySelector("input[type='radio']").focused, true);
    fill(controller, 6);
    assert.equal(completions, 1);
    assert.equal(controller.elements.form.hidden, true);
    assert.equal(controller.elements.completion.hidden, false);
    assert.equal(controller.elements.completion.focused, true);
    assert.equal(controller.elements.progress.value, 6);
    assert.equal(controller.elements.progress.max, 6);
    assert.equal(controller.elements.progress.attributes.get("aria-valuetext"), "6 of 6 answered");
    assert.equal(controller.root.events.length, 1);
});

test("quick-to-full carries exact six values, starts at question seven, and needs only 24 more submits", () => {
    let completions = 0;
    const controller = makeController({ onComplete() { completions += 1; } });
    fill(controller, 6);
    const preview = { ...controller.answers };
    controller.setQuestions(MUPPET_FULL_QUESTIONS, { journeyId: "full" });
    assert.deepEqual(controller.answers, preview);
    assert.equal(controller.currentIndex, 6);
    assert.equal(controller.elements.progress.value, 6);
    assert.equal(controller.elements.progress.max, 30);
    assert.equal(controller.elements.stepStatus.textContent, "Question 7 of 30");
    assert.equal(controller.elements.form.hidden, false);
    fill(controller, 24);
    assert.equal(completions, 2);
    assert.equal(controller.getResponses().length, 30);
    for (const [id, value] of Object.entries(preview)) assert.equal(controller.answers[id], value);
});

test("back and edit retain selections, edited completed quiz can immediately recalculate", () => {
    let completions = 0;
    const controller = makeController({ onComplete() { completions += 1; } });
    choose(controller, 1);
    submit(controller);
    controller.handleBack();
    assert.equal(controller.answers[MUPPET_QUICK_QUESTIONS[0].id], 3.25);
    assert.match(controller.elements.question.innerHTML, /value="3.25"[\s\S]*?checked/);
    fill(controller, 6);
    controller.editQuestion(MUPPET_QUICK_QUESTIONS[1].id);
    assert.equal(controller.completed, false);
    choose(controller, 4);
    submit(controller);
    assert.equal(controller.answers[MUPPET_QUICK_QUESTIONS[1].id], 10);
    assert.equal(completions, 2);
});

test("full/quick toggles and reloads retain the entire bank and restore completed results", () => {
    const first = makeController();
    fill(first, 6);
    first.setQuestions(MUPPET_FULL_QUESTIONS, { journeyId: "full" });
    fill(first, 3);
    const answers = { ...first.answers };
    first.setQuestions(MUPPET_QUICK_QUESTIONS, { journeyId: "quick" });
    assert.equal(first.getResponses().length, 6);
    assert.equal(Object.keys(first.answers).length, 9);
    first.destroy();
    let restoredCompletions = 0;
    const restored = makeController({ onComplete() { restoredCompletions += 1; } });
    assert.equal(restoredCompletions, 1);
    assert.deepEqual(restored.answers, answers);
    assert.equal(restored.elements.completion.focused, false);
    restored.setQuestions(MUPPET_FULL_QUESTIONS, { journeyId: "full" });
    assert.equal(restored.currentIndex, 9);
    assert.equal(restored.elements.progress.value, 9);
    restored.destroy();
    const full = makeController({ questions: MUPPET_FULL_QUESTIONS, journeyId: "full" });
    assert.equal(full.currentIndex, 9);
    assert.deepEqual(full.answers, answers);
});

test("restoration strictly rejects old values and invalid answers while keeping valid ones in inactive mode", () => {
    const answers = {
        "uhci-q01": 3,
        "uhci-q06": "5.5",
        "uhci-q11": 7.75,
        "uhci-q16": null,
        "uhci-q21": 100,
        "uhci-q26": 10,
        "uhci-q02": 3.25,
        unknown: 5.5
    };
    const state = restoreQuizState({
        version: 2, journeyId: "full", answers, currentQuestionId: "uhci-q30", completed: true
    }, MUPPET_FULL_QUESTIONS, MUPPET_QUICK_QUESTIONS, "quick");
    assert.deepEqual(state.answers, { "uhci-q11": 7.75, "uhci-q26": 10, "uhci-q02": 3.25 });
    assert.equal(state.currentIndex, 0);
    assert.equal(state.completed, false);
    assert.equal(state.discardedAnswers, true);
    assert.throws(() => restoreQuizState({ version: 1, answers }, MUPPET_FULL_QUESTIONS, MUPPET_QUICK_QUESTIONS, "quick"), /unsupported/);
});

test("invalid saved positions never index outside the active journey", () => {
    for (const currentQuestionId of [null, "unknown", 20, "__proto__"]) {
        const state = restoreQuizState({
            version: 2, journeyId: "quick", currentQuestionId, answers: { "uhci-q01": 1 }
        }, MUPPET_FULL_QUESTIONS, MUPPET_QUICK_QUESTIONS, "quick");
        assert.equal(state.currentIndex, 1);
    }
});

test("a jump to the last question cannot complete with unanswered earlier questions", () => {
    let completions = 0;
    const controller = makeController({ onComplete() { completions += 1; } });
    controller.editQuestion(MUPPET_QUICK_QUESTIONS.at(-1).id);
    choose(controller);
    submit(controller);
    assert.equal(completions, 0);
    assert.equal(controller.currentIndex, 0);
    assert.match(controller.elements.error.textContent, /unanswered/);
});

test("reset removes both modes and the stored completion, without saving a replacement", () => {
    const controller = makeController();
    fill(controller, 6);
    controller.setQuestions(MUPPET_FULL_QUESTIONS, { journeyId: "full" });
    choose(controller);
    controller.reset();
    assert.deepEqual(controller.answers, {});
    assert.equal(controller.completed, false);
    assert.equal(controller.currentIndex, 0);
    assert.equal(controller.elements.progress.value, 0);
    assert.equal(store.has("test-journey"), false);
    assert.equal(controller.elements.completion.hidden, true);
    assert.equal(controller.elements.question.querySelector(".question-legend").focused, true);
});

test("corrupt storage is surfaced and cleared, then saving can resume", (context) => {
    context.mock.method(console, "warn", () => {});
    store.set("test-journey", "{broken");
    const controller = makeController();
    assert.match(controller.elements.saveStatus.textContent, /unreadable saved progress was cleared/);
    assert.equal(store.has("test-journey"), false);
    choose(controller, 3);
    assert.equal(JSON.parse(store.get("test-journey")).answers["uhci-q01"], 7.75);
});

test("unavailable storage does not block completion or reset and is reported", (context) => {
    context.mock.method(console, "error", () => {});
    context.mock.method(localStorage, "getItem", () => { throw new Error("denied"); });
    context.mock.method(localStorage, "removeItem", () => { throw new Error("denied"); });
    let completions = 0;
    const controller = makeController({ onComplete() { completions += 1; } });
    assert.match(controller.elements.saveStatus.textContent, /cannot be read or saved/);
    fill(controller, 6);
    assert.equal(completions, 1);
    controller.reset();
    assert.match(controller.elements.saveStatus.textContent, /could not be cleared/);
    assert.deepEqual(controller.answers, {});
});

test("storage quota failure leaves in-memory progress usable with an explicit save warning", (context) => {
    context.mock.method(console, "error", () => {});
    const controller = makeController();
    context.mock.method(localStorage, "setItem", () => { throw new Error("quota"); });
    fill(controller, 6);
    assert.equal(controller.completed, true);
    assert.equal(controller.getResponses().length, 6);
    assert.match(controller.elements.saveStatus.textContent, /cannot be saved/);
});

test("reset still attempts to delete old saved answers after a storage write failure", (context) => {
    context.mock.method(console, "error", () => {});
    const controller = makeController();
    choose(controller);
    assert.equal(store.has("test-journey"), true);
    context.mock.method(localStorage, "setItem", () => { throw new Error("quota"); });
    choose(controller, 3);
    assert.equal(controller.storageAvailable, false);
    controller.reset();
    assert.equal(store.has("test-journey"), false);
    assert.equal(controller.storageAvailable, true);
    assert.match(controller.elements.saveStatus.textContent, /Saved progress cleared/);
});

test("renderer errors keep all answers, focus an error, and can be retried", (context) => {
    context.mock.method(console, "error", () => {});
    let calls = 0;
    const controller = makeController({ onComplete() { calls += 1; if (calls === 1) throw new Error("render"); } });
    fill(controller, 6);
    assert.equal(controller.completed, false);
    assert.equal(controller.elements.form.hidden, false);
    assert.equal(controller.getResponses().length, 6);
    assert.match(controller.elements.error.textContent, /could not show your result/);
    assert.equal(controller.elements.error.focused, true);
    submit(controller);
    assert.equal(controller.completed, true);
    assert.equal(calls, 2);
});

test("question hints follow option count rather than advertising unavailable 0 or 6-9 shortcuts", () => {
    const controller = makeController();
    assert.match(controller.elements.question.innerHTML, /Number keys 1–5/);
    assert.doesNotMatch(controller.elements.question.innerHTML, /0 chooses/);
    assert.equal(FREQUENCY_OPTIONS.length, 5);
    controller.destroy();
    assert.equal(controller.elements.form.listeners.size, 0);
    assert.equal(controller.elements.edit.listeners.size, 0);
});
