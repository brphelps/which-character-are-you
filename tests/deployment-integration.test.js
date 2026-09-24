import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeFiles = [
    'index.html', 'muppets.html', 'sesame-street.html', 'credits.html', 'results.html',
    'styles.css', 'styles/quiz.css', 'styles/results.css',
    'js/quiz-engine.js', 'js/quiz-controller.js', 'js/results-view.js',
    'js/muppets-quiz.js', 'js/sesame-quiz.js', 'js/muppet-profile.js',
    'js/results-page.js', 'js/result-sharing.js',
    'data/quiz-catalog.mjs', 'data/quiz-content.mjs', 'data/uhci-dimensions.mjs',
    'data/uhci-questions.mjs', 'data/uhci-characters.mjs',
];

function temporary(t) {
    const directory = mkdtempSync(path.join(tmpdir(), 'character-deployment-test-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    return directory;
}

function write(directory, file, content = '') {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
}

function fixture(t) {
    const directory = temporary(t);
    const source = path.join(directory, 'source');
    for (const file of runtimeFiles) {
        write(source, file, file.endsWith('.html') ? '<!doctype html><title>Fixture</title>' : '');
    }
    write(source, 'images/fixture.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    cpSync(path.join(root, 'scripts'), path.join(source, 'scripts'), { recursive: true });
    return { source, output: path.join(directory, 'pages') };
}

function run(source, script, ...args) {
    const result = spawnSync('bash', [path.join(source, 'scripts', script), ...args], {
        encoding: 'utf8',
    });
    assert.equal(result.error, undefined);
    return result;
}

function successful(result) {
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

test('deployment packages the production runtime and excludes repository-only files', (t) => {
    const output = path.join(temporary(t), 'pages');
    successful(run(root, 'build-pages.sh', output));
    for (const file of runtimeFiles) {
        assert.ok(existsSync(path.join(output, file)), `Missing runtime file: ${file}`);
    }
    for (const file of [
        '.git', '.github', 'README.md', 'docs', 'tests', 'scripts', 'package.json',
        'quiz-prototype.html', 'results-prototype.html',
        'henson-personality-index.md', 'muppet-questions.md',
    ]) {
        assert.ok(!existsSync(path.join(output, file)), `Unexpected published file: ${file}`);
    }
    successful(run(root, 'validate-site.sh', output));
});

test('deployment allowlist excludes new modules, prototypes, and private image metadata', (t) => {
    const { source, output } = fixture(t);
    write(source, 'js/private-experiment.js', 'throw new Error("Not public");');
    write(source, 'data/private-experiment.mjs', 'export const secret = "Not public";');
    write(source, 'images/notes.txt', 'Not public');
    write(source, 'quiz-prototype.html', '<title>Not public</title>');
    successful(run(source, 'build-pages.sh', output));
    assert.deepEqual(readdirSync(path.join(output, 'js')).sort(),
        runtimeFiles.filter((file) => file.startsWith('js/')).map((file) => path.basename(file)).sort());
    assert.deepEqual(readdirSync(path.join(output, 'images')), ['fixture.svg']);
    assert.ok(!existsSync(path.join(output, 'data/private-experiment.mjs')));
    assert.ok(!existsSync(path.join(output, 'quiz-prototype.html')));
    successful(run(source, 'build-pages.sh', output));
});

test('validation follows nested CSS and static, re-exported, and dynamic module imports', (t) => {
    const { source } = fixture(t);
    write(source, 'styles/quiz.css', '@import "./results.css"; .hero { background: url("../images/fixture.svg"); }');
    write(source, 'data/quiz-content.mjs', 'export const answer = 42;');
    write(source, 'js/quiz-engine.js', `
        import { answer } from '../data/quiz-content.mjs';
        export { answer } from '../data/quiz-content.mjs';
        import('../data/quiz-content.mjs');
        const image = { image: 'images/fixture.svg' };
    `);
    successful(run(source, 'validate-site.sh'));
    rmSync(path.join(source, 'data/quiz-content.mjs'));
    const result = run(source, 'validate-site.sh');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing local reference: \.\.\/data\/quiz-content\.mjs/);
});

test('validation rejects missing CSS images, .mjs syntax errors, and Pages-root paths', (t) => {
    const { source } = fixture(t);
    write(source, 'styles/results.css', '.portrait { background: url("../images/missing.jpg"); }');
    write(source, 'data/quiz-content.mjs', 'export const = ;');
    write(source, 'index.html', '<script type="module">import "./js/quiz-engine.js";</script><a href="/muppets.html">Quiz</a>');
    const result = run(source, 'validate-site.sh');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /styles\/results.css: missing local reference/);
    assert.match(result.stderr, /quiz-content.mjs: JavaScript syntax error/);
    assert.match(result.stderr, /root-relative reference breaks Pages subpaths/);
});

test('package validation catches dependencies omitted from the explicit allowlist', (t) => {
    const { source, output } = fixture(t);
    write(source, 'js/quiz-engine.js', 'import "./unlisted.js";');
    write(source, 'js/unlisted.js', 'export const validInSource = true;');
    successful(run(source, 'validate-site.sh'));
    const result = run(source, 'build-pages.sh', output);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing local reference: \.\/unlisted.js/);
});

test('packaging refuses source directories, unrelated output contents, and symlink assets', (t) => {
    const { source, output } = fixture(t);
    for (const target of [source, path.join(source, 'images')]) {
        assert.notEqual(run(source, 'build-pages.sh', target).status, 0);
    }
    write(output, 'keep.txt', 'Unrelated existing work');
    assert.notEqual(run(source, 'build-pages.sh', output).status, 0);
    assert.ok(existsSync(path.join(output, 'keep.txt')));
    rmSync(path.join(source, 'js/quiz-engine.js'));
    symlinkSync(path.join(source, 'js/quiz-controller.js'), path.join(source, 'js/quiz-engine.js'));
    assert.notEqual(run(source, 'build-pages.sh', output).status, 0);
});
