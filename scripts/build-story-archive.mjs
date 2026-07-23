import fs from 'node:fs';
import path from 'node:path';

const [sourceDir, corrected488, outputDir] = process.argv.slice(2);

if (!sourceDir || !corrected488 || !outputDir) {
  console.error('Usage: node build-story-archive.mjs <source-dir> <corrected-488> <output-dir>');
  process.exit(1);
}

const readField = (text, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(`【${escaped}】\\s*\\n([^\\n]+)`))?.[1]?.trim() || '未记录';
};

const readSituation = text => (
  text.match(/【当前局势】\s*\n([\s\S]*?)(?:\n\n---|\n---)/)?.[1]?.trim()
  || '当前局势未单独记录。'
);

const stories = [];

for (let id = 272; id <= 490; id += 1) {
  const file = id === 488
    ? corrected488
    : path.join(sourceDir, `双陆世界正文${id}.txt`);

  if (!fs.existsSync(file)) {
    throw new Error(`Missing story file: ${file}`);
  }

  const body = fs.readFileSync(file, 'utf8').replace(/\r/g, '').trimEnd();
  stories.push({
    id,
    time: readField(body, '游戏内时间'),
    location: readField(body, '地点'),
    situation: readSituation(body),
    body,
  });
}

fs.mkdirSync(outputDir, { recursive: true });

const ranges = [
  [272, 299],
  [300, 324],
  [325, 349],
  [350, 374],
  [375, 399],
  [400, 424],
  [425, 449],
  [450, 474],
  [475, 490],
];

for (const [start, end] of ranges) {
  const records = stories.filter(story => story.id >= start && story.id <= end);
  const target = path.join(outputDir, `story-${start}-${end}.json`);
  fs.writeFileSync(target, `${JSON.stringify(records)}\n`);
}

console.log(JSON.stringify({
  count: stories.length,
  first: stories[0].id,
  last: stories.at(-1).id,
  ranges,
}));
