#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const failures = [];
const passes = [];
const check = (condition, label, detail = '') => (condition ? passes : failures).push(label + (!condition && detail ? `：${detail}` : ''));
const expectedIds = Array.from({ length: 401 }, (_, index) => index + 272);
const expectedStoryFiles = [
  'story-272-299.json', 'story-300-324.json', 'story-325-349.json',
  'story-350-374.json', 'story-375-399.json', 'story-400-424.json',
  'story-425-449.json', 'story-450-474.json', 'story-475-490.json',
  'story-491-515.json', 'story-516-540.json', 'story-541-565.json',
  'story-566-590.json', 'story-591-615.json', 'story-616-640.json',
  'story-641-665.json', 'story-666-672.json',
];

for (const file of ['assets/timeline-current.txt', 'assets/characters-current.txt', 'assets/status-current.txt']) {
  check(exists(file), `${file}存在`);
}

const storyFiles = fs.readdirSync(path.join(root, 'assets'))
  .filter(name => /^story-\d+-\d+\.json$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

check(JSON.stringify(storyFiles) === JSON.stringify(expectedStoryFiles), '正文JSON分组文件与入口规划一致', storyFiles.join('、'));

const stories = [];
for (const file of storyFiles) {
  try {
    const rows = JSON.parse(read(`assets/${file}`));
    check(Array.isArray(rows), `${file}为合法JSON数组`);
    if (Array.isArray(rows)) stories.push(...rows);
  } catch (error) {
    check(false, `${file}可以解析`, error.message);
  }
}

const ids = stories.map(story => story.id);
const missingIds = expectedIds.filter(id => !ids.includes(id));
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];

check(stories.length === 401, '正文历史共401篇', `实际${stories.length}`);
check(JSON.stringify(ids) === JSON.stringify(expectedIds), '正文编号连续覆盖272—672', `缺失${missingIds.join('、') || '无'}`);
check(new Set(ids).size === ids.length, '正文编号没有重复');
check(!missingIds.length, '正文编号没有缺失', missingIds.join('、'));
check(!duplicateIds.length, '正文编号没有重复ID', duplicateIds.join('、'));
check(stories.every(story => story.time && story.location && story.situation && story.body), '每篇正文包含时间、地点、当前局势与完整正文');
check(ids[0] === 272 && ids.at(-1) === 672, '正文首篇272且最新正文672');

const storyById = new Map(stories.map(story => [story.id, story]));
const body488 = storyById.get(488)?.body || '';
const body493 = storyById.get(493)?.body || '';
const body494 = storyById.get(494)?.body || '';
check(body488.includes('《疾风踏步·战斗位移基础》'), '正文488使用正式传承名称');
check(['0/88200', '430/88200', '21级430/88200'].every(value => body488.includes(value)) && !body488.includes('44100'), '正文488经验上限为88200');
check(['430/88200', '8960/88200'].every(value => body493.includes(value)) && !body493.includes('44100'), '正文493经验上限为88200');
check(body494.includes('千叶21级，8960/88200；') && !body494.includes('44100'), '正文494经验上限为88200');
const badStoryCaps = stories.filter(story => /(?:0|430|8960)\/44100|21级[^\n]{0,20}44100/.test(story.body)).map(story => story.id);
check(!badStoryCaps.length, '正文JSON未残留千叶21级错误经验上限', badStoryCaps.join('、'));

const timeline = read('assets/timeline-current.txt');
const characters = read('assets/characters-current.txt');
const status = read('assets/status-current.txt');
const index = read('index.html');
const person = read('person.html');
const worldPower = read('assets/world-power.md');

const timelineEnd = timeline.match(/记录范围：\s*\n第\d+日\d+:\d+—(第\d+日\d+:\d+)/)?.[1];
const characterEnd = characters.match(/覆盖时间：\s*\n+(第\d+日\d+:\d+)/)?.[1];
const statusEnd = status.match(/覆盖时间：\s*\n(第\d+日\d+:\d+)/)?.[1];
check(timelineEnd === '第114日19:38' && characterEnd === timelineEnd && statusEnd === timelineEnd, '三份current文件覆盖时间一致且为第114日19:38', `${timelineEnd}/${characterEnd}/${statusEnd}`);
check(/【正文272—672】对应【事件272—672】，共401组/.test(timeline), '时间线范围为正文／事件272—672共401组');
const eventIds = [...timeline.matchAll(/【事件(\d+)】/g)].map(match => Number(match[1]));
check(eventIds.length === 401, '时间线事件总数为401', `实际${eventIds.length}`);
check(JSON.stringify(eventIds) === JSON.stringify(expectedIds), '时间线事件编号连续覆盖272—672');
check(new Set(eventIds).size === eventIds.length, '时间线事件编号没有重复');

check(/^等级：21级。?$/m.test(status) && /^经验：8960\/88200。?$/m.test(status), '千叶当前状态为21级8960/88200');
check(/力量50[；。]/.test(status) && /敏捷50[；。]/.test(status) && /体质45[；。]/.test(status) && /精神40[；。]/.test(status) && /魔力61[；。]/.test(status) && /感知37[；。]/.test(status), '当前六项属性为50／50／45／40／61／37');
check(/当前随身个人实体现金899金币07银02铜/.test(status) && /九塔钱庄可用7000金币、冻结经营担保金160金币/.test(status), '当前现金与九塔账户数据正确');
check(/生存点10721\.30/.test(status) && /当前任务证明0份/.test(status), '当前生存点10721.30且任务证明0份');
const currentFiles = [timeline, characters, status];
check(currentFiles.every(text => text.includes('第114日19:38')), '三份current文件均包含当前时间');
check(currentFiles.every(text => text.includes('金穗泉庭一楼宴客厅')), '三份current文件均包含当前地点');
check(currentFiles.every(text => text.includes('21级') && text.includes('8960/88200')), '三份current文件均包含21级8960/88200');
const badCurrentCaps = currentFiles.filter(text => /(?:430|8960)\/44100|21级[^\n]{0,20}44100/.test(text));
check(!badCurrentCaps.length, 'current文件未残留当前状态44100');
check(currentFiles.every(text => text.includes('第114日19:38，金穗泉庭一楼宴客厅')), '唯一续写点统一为第114日19:38金穗泉庭一楼宴客厅');

const requiredPeople = ['乔雨彤', '程芮', '齐妍', '唐知遥', '温溪', '徐真', '韩若薇', '何晴', '罗绮', '谢铮', '月岛梨奈', '赫妲', '露琪娅', '玛塔', '黛娜'];
check(requiredPeople.every(name => characters.includes(name)), '人物与关系包含当前新增人物与庄园管理人员');
check(/第114日加入的11名自由成年女性/.test(characters) && /两名未命名女性/.test(characters), '人物与关系包含第114日11名新成员说明');
check(/白榆河渠庄园28名成年女性人员/.test(characters) && /王都回收铺五名工作人员/.test(characters), '人物与关系包含庄园与王都店铺人员体系');
check(['闻溪／温溪', '许蓁／徐真', '何青／何晴', '谢筝／谢铮', '月岛莉奈／月岛梨奈', '沈媛、唐莉、赫达、白玉庄园'].every(value => characters.includes(value)), '姓名与地点统一规则完整保留');
check(status.includes('白榆河渠庄园') && status.includes('巧克力在楼上宿舍继续接受高阶血肉重塑'), '状态栏包含庄园与巧克力当前血肉重塑状态');
check(requiredPeople.every(name => index.includes(`'${name}'`) && person.includes(`'${name}'`)), '人物入口与详情页登记当前新增人物及庄园管理人员');
check([index, person].every(source => source.includes('namedRecords(shop.body,CAPITAL)') && source.includes('未命名私人飞机乘务员自称者') && source.includes('未命名“正妻气质”自认者')), '人物解析保留两名未命名新成员及王都新增档案');
check(/query\|\|characterMode==='全部'/.test(index), '人物全局搜索不受旧分类筛选限制');

const storyListBlock = index.match(/stories:\s*\[([\s\S]*?)\]\s*\n\s*\};/)?.[1] || '';
const entryStoryRefs = [...storyListBlock.matchAll(/['"](assets\/story-\d+-\d+\.json)['"]/g)].map(match => match[1]);
check(JSON.stringify(entryStoryRefs) === JSON.stringify(expectedStoryFiles.map(file => `assets/${file}`)), '入口按顺序加载全部正文JSON');
check(entryStoryRefs.every(exists), '入口引用的正文JSON全部存在');
check(/正文272—672/.test(index) && /共401篇/.test(index), '首页正文范围与总数更新为272—672共401篇');
check(/'620-672','620—672'/.test(index), '正文筛选可以覆盖最新正文672');
check(!/正文历史272—490\.txt|赤砾荒原北缘<br>红岩临时营地/.test(index), '首页未残留旧版下载范围或旧当前地点硬编码');
check(/正文历史/.test(index) && /storyView/.test(index), 'RP总览包含正文历史导航与视图');
check(/巧克力/.test(index) && /巧克力/.test(person), '巧克力可进入独立人物档案');

check(/最后真正令目标从存活状态变为死亡状态的人/.test(worldPower) && /不按累计伤害、控制、治疗、保护或其他团队贡献分配/.test(worldPower), '世界规则仍为最终致死者独占击杀经验');
check(/Lv\.81—89\s*\|\s*神话阶/.test(worldPower) && /Lv\.90—99\s*\|\s*神祇阶/.test(worldPower) && /Lv\.100\s*\|\s*主神阶/.test(worldPower), '世界规则阶段仍包含神话阶、神祇阶和主神阶');
check(/残破神格/.test(worldPower) && /完整、稳定且达到主神层次的神格/.test(worldPower) && /核心神职或主要权柄/.test(worldPower), '神格突破规则未被RP历史覆盖');

console.log(`RP资料审计：${passes.length} 项通过，${failures.length} 项失败。`);
for (const item of passes) console.log(`  ✓ ${item}`);
for (const item of failures) console.error(`  ✗ ${item}`);
if (failures.length) process.exit(1);
