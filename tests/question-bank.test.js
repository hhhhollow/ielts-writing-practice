const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function loadQuestionBank() {
  const source = fs.readFileSync(path.join(root, 'data', 'question-bank.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.IELTS_QUESTION_BANK.questionSets;
}

test('contains all Cambridge 18–21 tests in order', () => {
  const questionSets = loadQuestionBank();
  const expectedIds = Array.from({ length: 16 }, (_, index) => `C${18 + Math.floor(index / 4)}T${(index % 4) + 1}`);
  assert.deepEqual(Array.from(questionSets, (item) => item.id), expectedIds);
});

test('every test has complete tasks and a local image', () => {
  for (const questionSet of loadQuestionBank()) {
    assert.ok(questionSet.task1.category);
    assert.ok(questionSet.task1.text.includes('Write at least 150 words.'));
    assert.ok(questionSet.task2.category);
    assert.ok(questionSet.task2.text.includes('Write at least 250 words.'));
    assert.match(questionSet.task1.image, /^assets\/questions\/[a-z0-9]+\.png$/);
    assert.ok(fs.existsSync(path.join(root, questionSet.task1.image)));
  }
});

test('index loads the split assets in dependency order', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('href="assets/styles.css"'));
  const bankIndex = html.indexOf('src="data/question-bank.js"');
  const appIndex = html.indexOf('src="assets/app.js"');
  assert.ok(bankIndex >= 0);
  assert.ok(appIndex > bankIndex);
  assert.ok(!html.includes('data:image/'));
});
