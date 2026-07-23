#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const passes = [];
const check = (condition, label) => (condition ? passes : failures).push(label);

const storyFiles = fs.readdirSync(path.join(root, 'assets'))
  .filter(name => /^story-\d+-\d+\.json$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const stories = storyFiles.flatMap(file => JSON.parse(read(`assets/${file}`)));
const ids = stories.map(story => story.id);
const expectedIds = Array.from({ length: 219 }, (_, index) => index + 272);

check(stories.length === 219, '正文历史共219篇');
check(JSON.stringify(ids) === JSON.stringify(expectedIds), '正文编号连续覆盖272—490');
check(new Set(ids).size === ids.length, '正文编号没有重复');
check(stories.every(story => story.time && story.location && story.situation && story.body), '每篇正文包含时间、地点、当前局势与完整正文');
check(stories.find(story => story.id === 488)?.body.includes('《疾风踏步·战斗位移基础》'), '正文488使用正式传承名称');

const timeline = read('assets/timeline-current.txt');
const characters = read('assets/characters-current.txt');
const status = read('assets/status-current.txt');
const index = read('index.html');
const person = read('person.html');

check(/第60日10:17—第92日19:11/.test(timeline), '时间线覆盖至第92日19:11');
check(/当前最终生存点为92341\.00/.test(timeline), '时间线当前生存点为92341.00');
check(/第92日19:11/.test(characters) && /巧克力刚问他/.test(characters), '人物关系覆盖当前续写点');
check(/尚未掌握黄金王权基础形态/.test(characters), '人物关系未把训练解锁写成技能掌握');
check(/等级：21级/.test(status) && /经验：430\/44100/.test(status), '状态栏等级与经验正确');
check(/当前唯一有效余额为92341\.00/.test(status), '状态栏唯一当前生存点正确');
check(/正文历史/.test(index) && /storyView/.test(index), 'RP总览包含正文历史导航与视图');
check(/巧克力/.test(index) && /巧克力/.test(person), '巧克力可进入独立人物档案');

console.log(`RP资料审计：${passes.length} 项通过，${failures.length} 项失败。`);
for (const item of passes) console.log(`  ✓ ${item}`);
for (const item of failures) console.error(`  ✗ ${item}`);
if (failures.length) process.exit(1);
