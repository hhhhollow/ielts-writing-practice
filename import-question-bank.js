const fs = require('fs');
const sharp = require(require.resolve('sharp', {
  paths: ['/Users/liyumeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules']
}));

const markdownPath = '/Users/liyumeng/Desktop/IELTS/剑桥雅思18-21写作真题汇总.md';
const htmlPath = '/Users/liyumeng/Developer/ielts-writing-practice/index.html';

const markdown = fs.readFileSync(markdownPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractTask(section, requireImage) {
  const categoryMatch = section.match(/\* \*\*题型分类\*\*：([^\n]+)/);
  const questionMarker = '* **英文原题**：';
  const questionStart = section.indexOf(questionMarker);
  if (questionStart < 0) throw new Error('Missing English question block');
  const questionEnd = section.indexOf('* **中文大意**', questionStart);
  const questionBlock = section.slice(questionStart + questionMarker.length, questionEnd < 0 ? section.length : questionEnd);
  const text = questionBlock
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*>\s?(.*)$/)?.[1])
    .filter((line) => line !== undefined)
    .map((line) => line.replace(/\*\*/g, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const imageMatch = section.match(/!\[[^\]]*\]\((data:image\/[^;]+;base64,[^)]+)\)/);
  if (requireImage && !imageMatch) throw new Error('Missing Task 1 image');
  return {
    category: categoryMatch?.[1]?.trim() || '',
    text,
    ...(requireImage ? { image: imageMatch[1] } : {})
  };
}

const questionSets = [];
const bookMatches = Array.from(markdown.matchAll(/^## 剑桥雅思 (\d+).*$/gm));
for (let bookIndex = 0; bookIndex < bookMatches.length; bookIndex += 1) {
  const book = Number(bookMatches[bookIndex][1]);
  if (book < 18 || book > 21) continue;
  const bodyStart = bookMatches[bookIndex].index + bookMatches[bookIndex][0].length;
  const bodyEnd = bookMatches[bookIndex + 1]?.index ?? markdown.indexOf('\n## 雅思写作题型分布', bodyStart);
  const parts = markdown.slice(bodyStart, bodyEnd < 0 ? markdown.length : bodyEnd).split(/^### Test (\d+)\s*$/gm);
  for (let index = 1; index < parts.length; index += 2) {
    const test = Number(parts[index]);
    const testBody = parts[index + 1] || '';
    const task1Start = testBody.indexOf('#### 📊 Task 1 小作文');
    const task2Start = testBody.indexOf('#### ✍️ Task 2 大作文');
    if (task1Start < 0 || task2Start < 0) throw new Error(`Missing task in C${book}T${test}`);
    questionSets.push({
      id: `C${book}T${test}`,
      task1: extractTask(testBody.slice(task1Start, task2Start), true),
      task2: extractTask(testBody.slice(task2Start), false)
    });
  }
}

const expectedIds = [];
for (let book = 18; book <= 21; book += 1) {
  for (let test = 1; test <= 4; test += 1) expectedIds.push(`C${book}T${test}`);
}
if (questionSets.map((item) => item.id).join('|') !== expectedIds.join('|')) {
  throw new Error(`Unexpected question set order: ${questionSets.map((item) => item.id).join(', ')}`);
}
if (questionSets.some((item) => !item.task1.text || !item.task2.text || !item.task1.image)) {
  throw new Error('Incomplete question set');
}

async function trimQuestionImage(item) {
  const encoded = item.task1.image.split(',')[1];
  const input = Buffer.from(encoded, 'base64');
  const original = await sharp(input).metadata();
  const trimmed = await sharp(input)
    .trim({ background: '#ffffff', threshold: 10 })
    .png()
    .toBuffer({ resolveWithObject: true });
  const margin = 18;
  const trimLeft = -trimmed.info.trimOffsetLeft;
  const trimTop = -trimmed.info.trimOffsetTop;
  const left = Math.max(0, trimLeft - margin);
  const top = Math.max(0, trimTop - margin);
  const right = Math.min(original.width, trimLeft + trimmed.info.width + margin);
  const bottom = Math.min(original.height, trimTop + trimmed.info.height + margin);
  const { data, info } = await sharp(input)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });
  item.task1.image = `data:image/png;base64,${data.toString('base64')}`;
  return `${item.id}: ${original.width}x${original.height} -> ${info.width}x${info.height}`;
}

Promise.all(questionSets.map(trimQuestionImage)).then((cropSummary) => {
  const generatedBlock = `      const questionSets = ${JSON.stringify(questionSets, null, 8)};
      const prompts = {
        task1: questionSets.map((item) => ({ title: item.id, label: \`\${item.id} · \${item.task1.category}\`, text: item.task1.text, image: item.task1.image })),
        task2: questionSets.map((item) => ({ title: item.id, label: \`\${item.id} · \${item.task2.category}\`, text: item.task2.text }))
      };
      const defaultQuestionSet = questionSets[0];
      const defaultQuestions = {
        task1: defaultQuestionSet.task1.text,
        task2: defaultQuestionSet.task2.text
      };
      const defaultQuestionTitles = { task1: defaultQuestionSet.id, task2: defaultQuestionSet.id };`;

  const oldStartCandidates = [html.indexOf('      const questionSets = ['), html.indexOf('      const prompts = {')].filter((index) => index >= 0);
  const blockStart = Math.min(...oldStartCandidates);
  const titleStart = html.indexOf('      const defaultQuestionTitles =', blockStart);
  const blockEnd = html.indexOf(';', titleStart) + 1;
  if (!Number.isFinite(blockStart) || blockStart < 0 || titleStart < 0 || blockEnd <= titleStart) {
    throw new Error('Could not find the existing question bank block');
  }

  fs.writeFileSync(htmlPath, `${html.slice(0, blockStart)}${generatedBlock}${html.slice(blockEnd)}`);
  console.log(`Imported ${questionSets.length} tests, ${questionSets.length * 2} questions and ${questionSets.length} cropped images.`);
  console.log(cropSummary.join('\n'));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
