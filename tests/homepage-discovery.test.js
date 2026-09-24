import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const homepage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const plainText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const links = [...homepage.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, content]) => ({
    href: attributes.match(/\bhref="([^"]+)"/)?.[1],
    attributes,
    text: plainText(content),
}));

test('homepage leads with the provisional Muppet preview and an explicit full-profile route', () => {
    const primary = links.find(({ attributes }) => attributes.includes('home-primary-button'));
    assert.equal(primary?.href, 'muppets.html');
    assert.match(primary.attributes, /aria-describedby="preview-note"/);
    assert.match(primary.text, /Find my Muppet match/);
    const previewNote = homepage.match(/<p id="preview-note">([\s\S]*?)<\/p>/)?.[1];
    assert.ok(previewNote);
    assert.match(plainText(previewNote), /6 questions.*Quick preview.*provisional.*not the depth of the full profile/);
    assert.ok(links.some(({ href, text }) => href === 'muppets.html?mode=full' && /30-question full profile/.test(text)));
    assert.ok(homepage.indexOf('home-primary-button') < homepage.indexOf('reward-section'));
});

test('homepage groups depth choices under Muppets and keeps Sesame Street distinct', () => {
    const cards = [...homepage.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(([, card]) => card);
    assert.equal(cards.length, 2);
    assert.match(cards[0], /The Muppets/);
    assert.match(cards[0], /href="muppets.html"/);
    assert.match(cards[0], /Quick preview · 6 questions/);
    assert.match(cards[0], /href="muppets.html\?mode=full"/);
    assert.match(cards[0], /Full profile · 30 questions/);
    assert.match(cards[1], /Sesame Street/);
    assert.match(cards[1], /5 questions/);
    assert.match(cards[1], /href="sesame-street.html"/);
});

test('homepage shows the reward and identifies the optional example as a sample', () => {
    const reward = homepage.match(/<section class="reward-section"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(reward);
    assert.match(reward, /Your character match/);
    assert.match(reward, /Why you matched/);
    assert.match(reward, /Your closest alternatives/);
    assert.match(reward, /href="results.html\?example=1"[^>]*aria-describedby="example-note"/);
    assert.match(reward, /Sample answers, not your result/);
});

test('methodology is a closed native disclosure with nonjudgmental dimension poles', () => {
    const disclosure = homepage.match(/<details\b([^>]*)>([\s\S]*?)<\/details>/);
    assert.ok(disclosure);
    assert.doesNotMatch(disclosure[1], /\bopen\b/);
    assert.match(disclosure[2], /<summary>How the Muppet matching works<\/summary>/);
    assert.equal([...disclosure[2].matchAll(/<li>/g)].length, 6);
    assert.match(plainText(disclosure[2]), /Expressive.*Composed/);
    assert.match(plainText(disclosure[2]), /Adaptable.*Consistent/);
    assert.match(plainText(homepage), /not a psychological assessment/);
    assert.match(plainText(homepage), /never a measure of your worth/);
});

test('homepage reuses local portraits with accessible names, dimensions, and credits', () => {
    const portraits = [...homepage.matchAll(/<img\b([^>]*)>/g)].map(([, attributes]) => {
        const src = attributes.match(/\bsrc="([^"]+)"/)?.[1];
        assert.match(src, /^images\/[^/]+\.jpg$/);
        assert.ok(existsSync(new URL(`../${src}`, import.meta.url)));
        assert.match(attributes, /\balt="[^"]+"/);
        assert.match(attributes, /\bwidth="\d+"/);
        assert.match(attributes, /\bheight="\d+"/);
        return src;
    });
    assert.ok(portraits.includes('images/kermit.jpg'));
    assert.ok(portraits.includes('images/gonzo.jpg'));
    assert.ok(portraits.includes('images/cookie-monster.jpg'));
    assert.ok(links.some(({ href }) => href === 'credits.html'));
});

test('homepage uses project-relative links and truthful client-side privacy copy without time promises', () => {
    for (const { href } of links) {
        assert.ok(href);
        assert.doesNotMatch(href, /^(?:\/|[a-z]+:)/i);
    }
    assert.match(homepage, /<main id="main-content" tabindex="-1">/);
    assert.ok(links.some(({ href }) => href === '#main-content'));
    const text = plainText(homepage);
    assert.match(text, /No account needed/);
    assert.match(text, /Quizzes run on your device, in your browser/);
    assert.match(text, /progress is saved locally/);
    assert.doesNotMatch(text, /no storage|nothing is stored|\d+[- ](?:minutes?|seconds?)/i);
    assert.doesNotMatch(homepage, /<script\b/);
});
