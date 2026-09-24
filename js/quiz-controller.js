const STORAGE_VERSION = 2;
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
                || (typeof option.value === "number" && !Number.isFinite(option.value))
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

export function restoreQuizState(state, questionBank, questions, journeyId) {
    if (
        !state || state.version !== STORAGE_VERSION
        || !state.answers || typeof state.answers !== "object" || Array.isArray(state.answers)
    ) {
        throw new TypeError("Saved quiz progress uses an unsupported format.");
    }

    const answers = Object.fromEntries(questionBank.flatMap((question) => {
        const value = Object.hasOwn(state.answers, question.id) ? state.answers[question.id] : undefined;
        return question.options.some((option) => option.value === value) ? [[question.id, value]] : [];
    }));
    const firstUnanswered = questions.findIndex((question) => !Object.hasOwn(answers, question.id));
    const savedIndex = questions.findIndex((question) => question.id === state.currentQuestionId);
    const sameJourney = state.journeyId === journeyId;
    return {
        answers,
        currentIndex: sameJourney && savedIndex >= 0 ? savedIndex : Math.max(firstUnanswered, 0),
        completed: firstUnanswered === -1 && (!sameJourney || state.completed === true),
        discardedAnswers: Object.keys(answers).length !== Object.keys(state.answers).length
    };
}

export class QuizController {
    constructor({
        root,
        questions,
        questionBank = questions,
        journeyId = "default",
        storageKey = DEFAULT_STORAGE_KEY,
        onComplete = () => {}
    }) {
        if (!(root instanceof Element)) {
            throw new TypeError("QuizController requires a root Element.");
        }

        if (typeof onComplete !== "function") {
            throw new TypeError("QuizController onComplete must be a function.");
        }

        validateQuestions(questionBank);

        this.root = root;
        this.questionBank = questionBank;
        this.validateJourney(questions);
        this.questions = questions;
        this.journeyId = journeyId;
        this.storageKey = storageKey;
        this.onComplete = onComplete;
        this.answers = {};
        this.currentIndex = 0;
        this.completed = false;
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
        this.elements.review = root.querySelector("[data-quiz-review]");
        this.elements.edit = root.querySelector("[data-quiz-edit]");

        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleBack = this.handleBack.bind(this);
        this.handleChange = this.handleChange.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleReset = this.handleReset.bind(this);
        this.handleReview = () => this.editQuestion(this.elements.review.value);
        this.handleEdit = () => this.editQuestion(this.questions[0].id);

        this.elements.form.addEventListener("submit", this.handleSubmit);
        this.elements.form.addEventListener("change", this.handleChange);
        this.elements.form.addEventListener("keydown", this.handleKeydown);
        this.elements.back.addEventListener("click", this.handleBack);
        this.elements.reset.addEventListener("click", this.handleReset);
        this.elements.restart.addEventListener("click", this.handleReset);
        this.elements.review?.addEventListener("change", this.handleReview);
        this.elements.edit?.addEventListener("click", this.handleEdit);

        this.restore();
        if (this.completed) {
            this.complete({ moveFocus: false });
        } else {
            this.render({ moveFocus: false });
        }
    }

    validateJourney(questions) {
        validateQuestions(questions);
        for (const question of questions) {
            const original = this.questionBank.find((candidate) => candidate.id === question.id);
            if (!original || question.options.length !== original.options.length
                || question.options.some((option, index) => option.value !== original.options[index].value)) {
                throw new TypeError(`Question "${question.id}" must belong to the saved answer bank.`);
            }
        }
    }

    setQuestions(questions, { journeyId = this.journeyId, moveFocus = true } = {}) {
        this.validateJourney(questions);
        this.questions = questions;
        this.journeyId = journeyId;
        const firstUnanswered = questions.findIndex((question) => !Object.hasOwn(this.answers, question.id));
        this.currentIndex = Math.max(firstUnanswered, 0);
        this.completed = false;
        if (firstUnanswered === -1) {
            this.complete({ moveFocus });
        } else {
            this.persist();
            this.render({ moveFocus });
        }
    }

    editQuestion(questionId) {
        const index = this.questions.findIndex((question) => question.id === questionId);
        if (index < 0) {
            throw new RangeError(`Question "${questionId}" is not part of this quiz.`);
        }
        this.currentIndex = index;
        this.completed = false;
        this.persist();
        this.render();
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
        this.completed = false;
        const progressCleared = this.clearStoredProgress();
        this.elements.form.hidden = false;
        this.elements.completion.hidden = true;
        this.elements.summary.innerHTML = "";
        this.root.querySelector("[data-quiz-result]")?.replaceChildren();
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
        this.elements.review?.removeEventListener("change", this.handleReview);
        this.elements.edit?.removeEventListener("click", this.handleEdit);
    }

    render({ moveFocus = true } = {}) {
        this.elements.form.hidden = false;
        this.elements.completion.hidden = true;
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
                    Choose what feels closest; there is no right answer.
                    ${question.options.length <= 10
                        ? `Number keys 1–${Math.min(question.options.length, 9)} choose an option${question.options.length === 10 ? "; 0 chooses the last" : ""}.`
                        : ""}
                </p>
                <div class="answer-grid">${options}</div>
            </fieldset>
        `;

        this.elements.error.id = errorId;
        this.elements.error.textContent = "";
        this.elements.back.disabled = this.currentIndex === 0;
        this.elements.next.textContent = this.getResponses().length === totalQuestions
            || questionNumber === totalQuestions ? "See my result" : "Next";
        this.elements.progress.max = totalQuestions;
        this.elements.stepStatus.textContent = `Question ${questionNumber} of ${totalQuestions}`;
        this.updateAnsweredCount();

        if (moveFocus) {
            this.elements.question.querySelector(".question-legend")?.focus();
        }
    }

    handleChange(event) {
        const input = event.target instanceof Element ? event.target.closest("input[type='radio']") : null;
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
        if (this.getResponses().length === this.questions.length) {
            this.elements.next.textContent = "See my result";
        }
    }

    handleSubmit(event) {
        event.preventDefault();

        const question = this.questions[this.currentIndex];
        if (!Object.hasOwn(this.answers, question.id)) {
            this.elements.error.textContent = "Choose an answer before continuing.";
            this.elements.question.querySelector("input[type='radio']")?.focus();
            return;
        }

        if (this.getResponses().length === this.questions.length) {
            this.complete();
            return;
        } else if (this.currentIndex < this.questions.length - 1) {
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
            || (isInteractiveTarget(event.target) && !event.target.matches("input[type='radio']"))
            || !/^[0-9]$/.test(event.key)
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
        this.elements.progress.max = total;
        this.elements.progress.value = answered;
        this.elements.progress.textContent = `${answered} of ${total} answered`;
        this.elements.progress.setAttribute("aria-valuetext", `${answered} of ${total} answered`);
        if (this.elements.review) {
            this.elements.review.innerHTML = this.questions.map((question, index) => `
                <option value="${escapeHtml(question.id)}"${index === this.currentIndex ? " selected" : ""}>
                    ${index + 1}. ${Object.hasOwn(this.answers, question.id) ? "Answered" : "Not yet answered"}: ${escapeHtml(question.prompt)}
                </option>
            `).join("");
        }
    }

    complete({ moveFocus = true } = {}) {
        const firstUnanswered = this.questions.findIndex((question) => !Object.hasOwn(this.answers, question.id));
        if (firstUnanswered !== -1) {
            this.currentIndex = firstUnanswered;
            this.persist();
            this.render({ moveFocus });
            this.elements.error.textContent = "There is still an unanswered question. Choose an answer to continue.";
            return;
        }
        const responses = this.getResponses();
        this.elements.form.hidden = true;
        this.elements.completion.hidden = false;
        this.updateAnsweredCount();
        this.elements.stepStatus.textContent = "Quiz complete";
        this.elements.summary.innerHTML = responses.map((response, index) => {
            const question = this.questions[index];
            const option = question.options.find((candidate) => candidate.value === response.value);
            return `
                <div>
                    <dt>${escapeHtml(question.prompt)}</dt>
                    <dd>${escapeHtml(option.label)}</dd>
                </div>
            `;
        }).join("");

        try {
            this.onComplete(responses, this);
        } catch (error) {
            this.completed = false;
            this.persist();
            this.render({ moveFocus: false });
            this.elements.error.textContent = "We could not show your result. Your answers are still here. Please try again.";
            this.elements.error.tabIndex = -1;
            this.elements.error.focus();
            console.error("Unable to show quiz result.", error);
            return;
        }
        this.completed = true;
        this.persist();
        if (moveFocus) {
            this.elements.completion.focus();
        }
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
                journeyId: this.journeyId,
                currentQuestionId: this.questions[this.currentIndex].id,
                completed: this.completed,
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
        let rawState;
        try {
            rawState = localStorage.getItem(this.storageKey);
        } catch (error) {
            this.storageAvailable = false;
            this.elements.saveStatus.textContent = "Saved progress cannot be read or saved in this browser. You can still take the quiz.";
            console.error("Unable to restore quiz progress.", error);
            return;
        }
        if (!rawState) {
            return;
        }
        try {
            const state = restoreQuizState(JSON.parse(rawState), this.questionBank, this.questions, this.journeyId);
            this.answers = state.answers;
            this.currentIndex = state.currentIndex;
            this.completed = state.completed;
            this.elements.saveStatus.textContent = state.discardedAnswers
                ? "Saved progress restored. Some outdated answers were not restored."
                : "Saved progress restored on this device.";
        } catch (error) {
            const cleared = this.clearStoredProgress();
            this.elements.saveStatus.textContent = cleared
                ? "Old or unreadable saved progress was cleared. Please start a fresh quiz."
                : "Old or unreadable progress could not be cleared. You can still take a fresh quiz.";
            console.warn("Discarded invalid saved quiz progress.", error);
        }
    }

    clearStoredProgress() {
        try {
            localStorage.removeItem(this.storageKey);
            this.storageAvailable = true;
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
