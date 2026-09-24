const STORAGE_VERSION = 1;
const DEFAULT_STORAGE_KEY = "which-character-are-you:quiz:v1";

function isInteractiveTarget(target) {
    return target instanceof Element
        && Boolean(target.closest("a, button, input, select, textarea, [contenteditable='true']"));
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];
    });
}

function validateQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new TypeError("QuizController requires a non-empty questions array.");
    }

    const questionIds = new Set();
    questions.forEach((question, questionIndex) => {
        if (
            !question
            || typeof question.id !== "string"
            || question.id.length === 0
            || typeof question.prompt !== "string"
            || question.prompt.length === 0
            || !Array.isArray(question.options)
            || question.options.length === 0
        ) {
            throw new TypeError(`Question ${questionIndex + 1} has an invalid shape.`);
        }

        if (questionIds.has(question.id)) {
            throw new TypeError(`Question id "${question.id}" must be unique.`);
        }
        questionIds.add(question.id);

        const optionValues = new Set();
        question.options.forEach((option, optionIndex) => {
            if (
                !option
                || !["string", "number"].includes(typeof option.value)
                || typeof option.label !== "string"
                || option.label.length === 0
            ) {
                throw new TypeError(
                    `Question "${question.id}" option ${optionIndex + 1} has an invalid shape.`
                );
            }

            const valueKey = `${typeof option.value}:${String(option.value)}`;
            if (optionValues.has(valueKey)) {
                throw new TypeError(`Question "${question.id}" option values must be unique.`);
            }
            optionValues.add(valueKey);
        });
    });
}

export class QuizController {
    constructor({
        root,
        questions,
        storageKey = DEFAULT_STORAGE_KEY,
        onComplete = () => {}
    }) {
        if (!(root instanceof Element)) {
            throw new TypeError("QuizController requires a root Element.");
        }

        if (typeof onComplete !== "function") {
            throw new TypeError("QuizController onComplete must be a function.");
        }

        validateQuestions(questions);

        this.root = root;
        this.questions = questions;
        this.storageKey = storageKey;
        this.onComplete = onComplete;
        this.answers = {};
        this.currentIndex = 0;
        this.storageAvailable = true;

        this.elements = {
            form: root.querySelector("[data-quiz-form]"),
            question: root.querySelector("[data-quiz-question]"),
            error: root.querySelector("[data-quiz-error]"),
            back: root.querySelector("[data-quiz-back]"),
            next: root.querySelector("[data-quiz-next]"),
            progress: root.querySelector("[data-quiz-progress]"),
            stepStatus: root.querySelector("[data-quiz-step-status]"),
            answeredCount: root.querySelector("[data-quiz-answered-count]"),
            saveStatus: root.querySelector("[data-quiz-save-status]"),
            reset: root.querySelector("[data-quiz-reset]"),
            completion: root.querySelector("[data-quiz-completion]"),
            summary: root.querySelector("[data-quiz-summary]"),
            restart: root.querySelector("[data-quiz-restart]")
        };

        const missingElement = Object.entries(this.elements).find(([, element]) => !element);
        if (missingElement) {
            throw new Error(`QuizController could not find [data-quiz-${missingElement[0]}].`);
        }

        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleBack = this.handleBack.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleReset = this.handleReset.bind(this);

        this.elements.form.addEventListener("submit", this.handleSubmit);
        this.elements.form.addEventListener("change", this.handleChange);
        this.elements.form.addEventListener("keydown", this.handleKeydown);
        this.elements.back.addEventListener("click", this.handleBack);
        this.elements.reset.addEventListener("click", this.handleReset);
        this.elements.restart.addEventListener("click", this.handleReset);

        this.restore();
        this.render({ moveFocus: false });
    }

    getResponses() {
        return this.questions
            .filter((question) => Object.hasOwn(this.answers, question.id))
            .map((question) => ({
                questionId: question.id,
                value: this.answers[question.id]
            }));
    }

    reset({ moveFocus = true } = {}) {
        this.answers = {};
        this.currentIndex = 0;
        const progressCleared = this.clearStoredProgress();
        this.elements.form.hidden = false;
        this.elements.completion.hidden = true;
        this.elements.saveStatus.textContent = progressCleared
            ? "Saved progress cleared."
            : "Answers reset, but saved progress could not be cleared.";
        this.render({ moveFocus });
    }

    destroy() {
        this.elements.form.removeEventListener("submit", this.handleSubmit);
        this.elements.form.removeEventListener("change", this.handleChange);
        this.elements.form.removeEventListener("keydown", this.handleKeydown);
        this.elements.back.removeEventListener("click", this.handleBack);
        this.elements.reset.removeEventListener("click", this.handleReset);
        this.elements.restart.removeEventListener("click", this.handleReset);
    }

    render({ moveFocus = true } = {}) {
        const question = this.questions[this.currentIndex];
        const questionNumber = this.currentIndex + 1;
        const totalQuestions = this.questions.length;
        const selectedValue = this.answers[question.id];
        const hintId = `quiz-hint-${question.id}`;
        const errorId = `quiz-error-${question.id}`;
        const options = question.options.map((option, index) => {
            const inputId = `quiz-${question.id}-${index}`;
            const checked = option.value === selectedValue ? " checked" : "";
            const shortcut = index === 9 ? "0" : String(index + 1);

            return `
                <label class="answer-option" for="${escapeHtml(inputId)}">
                    <input
                        id="${escapeHtml(inputId)}"
                        name="${escapeHtml(question.id)}"
                        type="radio"
                        value="${escapeHtml(option.value)}"
                        data-option-index="${index}"
                        ${checked}
                    >
                    <span class="answer-option__shortcut" aria-hidden="true">${shortcut}</span>
                    <span class="answer-option__value">${escapeHtml(option.value)}</span>
                    <span class="answer-option__label">${escapeHtml(option.label)}</span>
                </label>
            `;
        }).join("");

        this.elements.question.innerHTML = `
            <fieldset class="question-fieldset" aria-describedby="${escapeHtml(hintId)} ${escapeHtml(errorId)}">
                <legend class="question-legend" tabindex="-1">
                    <span class="question-number">Question ${questionNumber}</span>
                    ${escapeHtml(question.prompt)}
                </legend>
                <p class="question-hint" id="${escapeHtml(hintId)}">
                    Choose one answer. Number keys 1–9 select those values; 0 selects 10.
                </p>
                <div class="answer-grid">${options}</div>
            </fieldset>
        `;

        this.elements.error.id = errorId;
        this.elements.error.textContent = "";
        this.elements.back.disabled = this.currentIndex === 0;
        this.elements.next.textContent = questionNumber === totalQuestions ? "Complete quiz" : "Next";
        this.elements.progress.max = totalQuestions;
        this.elements.progress.value = questionNumber;
        this.elements.progress.textContent = `Question ${questionNumber} of ${totalQuestions}`;
        this.elements.stepStatus.textContent = `Question ${questionNumber} of ${totalQuestions}`;
        this.updateAnsweredCount();

        if (moveFocus) {
            this.elements.question.querySelector(".question-legend")?.focus();
        }
    }

    handleChange(event) {
        const input = event.target.closest("input[type='radio']");
        if (!input) {
            return;
        }

        const question = this.questions[this.currentIndex];
        const option = question.options[Number(input.dataset.optionIndex)];
        if (!option) {
            return;
        }

        this.answers[question.id] = option.value;
        this.elements.error.textContent = "";
        this.persist();
        this.updateAnsweredCount();
    }

    handleSubmit(event) {
        event.preventDefault();

        const question = this.questions[this.currentIndex];
        if (!Object.hasOwn(this.answers, question.id)) {
            this.elements.error.textContent = "Choose an answer before continuing.";
            this.elements.question.querySelector("input[type='radio']")?.focus();
            return;
        }

        if (this.currentIndex < this.questions.length - 1) {
            this.currentIndex += 1;
            this.persist();
            this.render();
            return;
        }

        this.complete();
    }

    handleBack() {
        if (this.currentIndex === 0) {
            return;
        }

        this.currentIndex -= 1;
        this.persist();
        this.render();
    }

    handleKeydown(event) {
        if (
            event.defaultPrevented
            || event.repeat
            || event.altKey
            || event.ctrlKey
            || event.metaKey
            || isInteractiveTarget(event.target)
        ) {
            return;
        }

        const optionIndex = event.key === "0" ? 9 : Number(event.key) - 1;
        const question = this.questions[this.currentIndex];
        if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) {
            return;
        }

        const input = this.elements.question.querySelector(`input[data-option-index="${optionIndex}"]`);
        if (!input) {
            return;
        }

        event.preventDefault();
        input.checked = true;
        input.focus();
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    handleReset() {
        this.reset();
    }

    updateAnsweredCount() {
        const answered = this.getResponses().length;
        const total = this.questions.length;
        this.elements.answeredCount.textContent = `${answered} of ${total} answered`;
    }

    complete() {
        const responses = this.getResponses();
        const progressCleared = this.clearStoredProgress();
        this.elements.form.hidden = true;
        this.elements.completion.hidden = false;
        this.elements.progress.value = this.questions.length;
        this.elements.stepStatus.textContent = "Quiz complete";
        this.elements.answeredCount.textContent = `${this.questions.length} of ${this.questions.length} answered`;
        this.elements.saveStatus.textContent = progressCleared
            ? "Completed responses are ready for scoring."
            : "Responses are ready, but saved progress could not be cleared.";
        this.elements.summary.innerHTML = responses.map((response, index) => {
            const question = this.questions[index];
            const option = question.options.find((candidate) => candidate.value === response.value);
            return `
                <div>
                    <dt>${escapeHtml(question.prompt)}</dt>
                    <dd>${escapeHtml(response.value)} — ${escapeHtml(option?.label ?? "Selected")}</dd>
                </div>
            `;
        }).join("");

        this.elements.completion.focus();
        this.onComplete(responses, this);
        this.root.dispatchEvent(new CustomEvent("quiz:complete", {
            bubbles: true,
            detail: { responses }
        }));
    }

    persist() {
        if (!this.storageAvailable) {
            return;
        }

        try {
            localStorage.setItem(this.storageKey, JSON.stringify({
                version: STORAGE_VERSION,
                currentIndex: this.currentIndex,
                answers: this.answers
            }));
            this.elements.saveStatus.textContent = "Progress saved on this device.";
        } catch (error) {
            this.storageAvailable = false;
            this.elements.saveStatus.textContent = "Progress cannot be saved in this browser.";
            console.error("Unable to save quiz progress.", error);
        }
    }

    restore() {
        try {
            const rawState = localStorage.getItem(this.storageKey);
            if (!rawState) {
                return;
            }

            const state = JSON.parse(rawState);
            if (state.version !== STORAGE_VERSION || typeof state.answers !== "object" || state.answers === null) {
                this.clearStoredProgress();
                return;
            }

            this.answers = Object.fromEntries(this.questions.flatMap((question) => {
                const savedValue = state.answers[question.id];
                const isValid = question.options.some((option) => option.value === savedValue);
                return isValid ? [[question.id, savedValue]] : [];
            }));
            this.currentIndex = Number.isInteger(state.currentIndex)
                ? Math.min(Math.max(state.currentIndex, 0), this.questions.length - 1)
                : 0;
            this.elements.saveStatus.textContent = "Saved progress restored.";
        } catch (error) {
            this.storageAvailable = false;
            this.elements.saveStatus.textContent = "Saved progress could not be restored.";
            console.error("Unable to restore quiz progress.", error);
        }
    }

    clearStoredProgress() {
        if (!this.storageAvailable) {
            return false;
        }

        try {
            localStorage.removeItem(this.storageKey);
            return true;
        } catch (error) {
            this.storageAvailable = false;
            this.elements.saveStatus.textContent = "Saved progress could not be cleared.";
            console.error("Unable to clear quiz progress.", error);
            return false;
        }
    }
}

export function createQuizController(options) {
    return new QuizController(options);
}
