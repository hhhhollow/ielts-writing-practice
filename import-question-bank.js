#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_OUTPUT = 'data/question-bank.js';
const DEFAULT_IMAGE_DIRECTORY = 'assets/questions';

function printUsage() {
  console.log(`Usage: node import-question-bank.js <question-bank.md> [options]

Options:
  --output <file>       Generated browser script (default: ${DEFAULT_OUTPUT})
  --images <directory> Extracted Task 1 images (default: ${DEFAULT_IMAGE_DIRECTORY})
  --help                Show this help message`);
}

function parseArguments(argv) {
  const options = { input: '', output: DEFAULT_OUTPUT, images: DEFAULT_IMAGE_DIRECTORY };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { ...options, help: true };
    if (argument === '--output' || argument === '--images') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
    if (options.input) throw new Error('Only one Markdown input file may be provided');
    options.input = argument;
  }
  return options;
}

function extractTask(section, requireImage) {
  const categoryMatch = section.match(/\* \*\*题型分类\*\*：([^\n]+)/);
  const questionMarker = '* **英文原题**：';
  const questionStart = section.indexOf(questionMarker);
  if (questionStart < 0) throw new Error('Missing English question block');

  const questionEnd = section.indexOf('* **中文大意**', questionStart);
  const questionBlock = section.slice(
    questionStart + questionMarker.length,
    questionEnd < 0 ? section.length : questionEnd
  );
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

function parseQuestionSets(markdown) {
  const questionSets = [];
  const bookMatches = Array.from(markdown.matchAll(/^## 剑桥雅思 (\d+).*$/gm));

  for (let bookIndex = 0; bookIndex < bookMatches.length; bookIndex += 1) {
    const book = Number(bookMatches[bookIndex][1]);
    if (book < 18 || book > 21) continue;

    const bodyStart = bookMatches[bookIndex].index + bookMatches[bookIndex][0].length;
    const nextBookStart = bookMatches[bookIndex + 1]?.index;
    const distributionStart = markdown.indexOf('\n## 雅思写作题型分布', bodyStart);
    const bodyEnd = nextBookStart ?? (distributionStart < 0 ? markdown.length : distributionStart);
    const parts = markdown.slice(bodyStart, bodyEnd).split(/^### Test (\d+)\s*$/gm);

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

  const expectedIds = Array.from({ length: 16 }, (_, index) => {
    const book = 18 + Math.floor(index / 4);
    return `C${book}T${(index % 4) + 1}`;
  });
  const actualIds = questionSets.map((item) => item.id);
  if (actualIds.join('|') !== expectedIds.join('|')) {
    throw new Error(`Expected ${expectedIds.join(', ')}, received ${actualIds.join(', ') || 'no questions'}`);
  }
  if (questionSets.some((item) => !item.task1.text || !item.task2.text || !item.task1.image)) {
    throw new Error('Question bank contains an incomplete question set');
  }
  return questionSets;
}

async function writeQuestionImage(item, imageDirectory, imageUrlPrefix) {
  const sharp = require('sharp');
  const encoded = item.task1.image.split(',')[1];
  const input = Buffer.from(encoded, 'base64');
  const outputName = `${item.id.toLowerCase()}.png`;
  const outputPath = path.join(imageDirectory, outputName);

  await sharp(input)
    .trim({ background: '#ffffff', threshold: 10 })
    .extend({ top: 18, right: 18, bottom: 18, left: 18, background: '#ffffff' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

  item.task1.image = `${imageUrlPrefix}/${outputName}`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  if (!options.input) {
    printUsage();
    throw new Error('A Markdown input file is required');
  }

  const inputPath = path.resolve(options.input);
  const outputPath = path.resolve(options.output);
  const imageDirectory = path.resolve(options.images);
  const imageUrlPrefix = path.relative(process.cwd(), imageDirectory).split(path.sep).join('/');
  const markdown = await fs.readFile(inputPath, 'utf8');
  const questionSets = parseQuestionSets(markdown);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(imageDirectory, { recursive: true });
  await Promise.all(questionSets.map((item) => writeQuestionImage(item, imageDirectory, imageUrlPrefix)));

  const output = `(() => {\n  const questionSets = ${JSON.stringify(questionSets, null, 2)};\n  window.IELTS_QUESTION_BANK = Object.freeze({ questionSets });\n})();\n`;
  await fs.writeFile(outputPath, output);
  console.log(`Imported ${questionSets.length} tests and ${questionSets.length * 2} questions.`);
  console.log(`Question bank: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`Images: ${path.relative(process.cwd(), imageDirectory)}`);
}

main().catch((error) => {
  console.error(`Import failed: ${error.message}`);
  process.exitCode = 1;
});
