#!/usr/bin/env node
/**
 * 双陆世界资料库零依赖审计。
 *
 * 运行：node scripts/audit-world-data.mjs
 * 要求：Node.js 18+；不需要安装任何 npm 包。
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const warnings=[];
const pass=[];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const check=(ok,label,detail='')=>{if(ok)pass.push(label);else failures.push(label+(detail?'：'+detail:''))};

function evaluate(file,expose){
  const context=vm.createContext({console});
  vm.runInContext(read(file)+`\n;globalThis.__AUDIT__=(${expose});`,context,{filename:file});
  return context.__AUDIT__;
}

const map=evaluate('assets/world-map-data.js','WORLD_MAP_DATA');
const peopleContext=vm.createContext({console});
vm.runInContext(read('assets/organizations.js'),peopleContext,{filename:'assets/organizations.js'});
vm.runInContext(read('assets/world-people.js')+'\n;globalThis.__AUDIT__={people:WORLD_PEOPLE,houses:POLITICAL_HOUSES};',peopleContext,{filename:'assets/world-people.js'});
const {people,houses}=peopleContext.__AUDIT__;
const polities=map.polities;

check(polities.length===70,'正式政权总数为70',`实际 ${polities.length}`);
const countType=t=>polities.filter(p=>p.type===t).length;
check(countType('人类帝国')===5,'人类帝国数量为5',countType('人类帝国'));
check(countType('人类王国')===17,'人类王国数量为17',countType('人类王国'));
check(countType('独立公国')+countType('附属公国')===32,'公国与大公领数量为32',countType('独立公国')+countType('附属公国'));
check(countType('独立公国')===11,'独立公国数量为11',countType('独立公国'));
check(countType('附属公国')===21,'附属公国数量为21',countType('附属公国'));
check(countType('精灵王庭')===1,'精灵王庭数量为1',countType('精灵王庭'));
check(countType('兽人国家')===4,'兽人国家数量为4',countType('兽人国家'));
check(countType('矮人高山王国')===3,'矮人王国数量为3',countType('矮人高山王国'));
const cityStates=polities.filter(p=>['独立城邦','城邦联盟'].includes(p.type));
check(cityStates.length===8,'城邦与城邦联盟正好8个',cityStates.length);

const polityNames=polities.map(p=>p.name);
const duplicates=polityNames.filter((n,i)=>polityNames.indexOf(n)!==i);
check(!duplicates.length,'政权名称不重复',[...new Set(duplicates)].join('、'));

const required=['name','type','region','capital','population','peoples','government','ruler','economy','military','language','commonLanguageRate','diplomacy','currentIssue'];
const incomplete=polities.flatMap(p=>required.filter(k=>p[k]===undefined||p[k]===null||String(p[k]).trim()==='').map(k=>`${p.name}.${k}`));
const badCoords=polities.filter(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y));
check(!incomplete.length&&!badCoords.length,'所有政权具备位置、首都、人口、统治者及最低档案字段',[...incomplete,...badCoords.map(p=>p.name+'.坐标')].join('、'));
check(polities.every(p=>p.peoples&&String(p.peoples).trim()),'全部70个政权均有明确主要族群字段');
const broadLanguageLabels=polities.filter(p=>/^(中央人类诸语|东南林缘语|南廊诸语|西北兽人语|高山矮人语)$/.test(p.language)).map(p=>`${p.name}: ${p.language}`);
check(!broadLanguageLabels.length,'政权母语使用本地名称并保留语族信息',broadLanguageLabels.join('；'));

const nameSet=new Set(people.map(p=>p.name));
const missingRelations=[];
for(const p of people)for(const r of p.relations||[])if(!nameSet.has(r.name))missingRelations.push(`${p.name} → ${r.name}`);
check(!missingRelations.length,'所有人物关系引用对象存在',missingRelations.slice(0,12).join('；'));

const houseByPolity=new Map(houses.map(h=>[h.polity,h]));
const missingHouses=polities.filter(p=>!houseByPolity.has(p.name)).map(p=>p.name);
const rulerMismatch=polities.filter(p=>houseByPolity.has(p.name)&&houseByPolity.get(p.name).ruler!==p.ruler).map(p=>`${p.name}: ${p.ruler} / ${houseByPolity.get(p.name).ruler}`);
check(!missingHouses.length,'70个政权均有人物统治档案',missingHouses.join('、'));
check(!rulerMismatch.length,'地图统治者与人物档案一致',rulerMismatch.join('；'));

const nodeCollections=['specialSettlements','localPlaces','lordships'];
const nodeNames=new Set([...polityNames,map.blackRaven?.name,...nodeCollections.flatMap(k=>(map[k]||[]).map(x=>x.name))].filter(Boolean));
const missingParents=[];
for(const key of nodeCollections)for(const n of map[key]||[]){if(n.polity&&!polityNames.includes(n.polity))missingParents.push(`${key}.${n.name}.polity=${n.polity}`);if(n.parent&&!nodeNames.has(n.parent))missingParents.push(`${key}.${n.name}.parent=${n.parent}`)}
if(map.blackRaven?.parent&&!polityNames.includes(map.blackRaven.parent))missingParents.push(`blackRaven.parent=${map.blackRaven.parent}`);
for(const p of polities)if(p.overlord&&!polityNames.includes(p.overlord))missingParents.push(`${p.name}.overlord=${p.overlord}`);
check(!missingParents.length,'地图节点与宗主引用均存在',missingParents.join('；'));

const worldHtml=read('world.html');
const assetRefs=[...worldHtml.matchAll(/['"]((?:assets\/)[^'"?#]+)['"]/g)].map(m=>m[1]);
const missingAssets=[...new Set(assetRefs)].filter(p=>!exists(p));
check(!missingAssets.length,'world.html 请求的资源文件均存在',missingAssets.join('、'));
check(/const\s+POLITIES\s*=\s*WORLD_MAP_DATA\.polities/.test(worldHtml)&&!/const\s+P\s*=/.test(worldHtml),'world.html 以 WORLD_MAP_DATA 为唯一政权来源');
check(!/\['demography',[^\]]*'人口'\]/.test(worldHtml)&&!/'demography','人口、聚落与文明密度'/.test(worldHtml),'人口文章不再占据一级导航或首页入口');
check(/\['城邦与联盟','城邦与联盟'\]/.test(worldHtml)&&/\['独立城邦','城邦联盟'\]\.includes\(p\.type\)/.test(worldHtml),'城邦与联盟前台统一筛选7＋1为8个');
check(/大陆政权档案/.test(worldHtml)&&/返回政权列表/.test(worldHtml)&&/打开政权档案/.test(worldHtml),'政权档案界面称谓已统一');
check(/主要族群：/.test(worldHtml)&&/\['主要族群',p\.peoples\]/.test(worldHtml),'政权卡片与详情均显示主要族群');
check(/全部种族/.test(worldHtml)&&/人类','半精灵','精灵','兽人','矮人','魔族','混血','其他/.test(worldHtml),'人物目录具备独立种族筛选');
check(/p\.race\|\|'其他'/.test(worldHtml)&&/AGE_LABEL\(p\.age\)/.test(worldHtml),'人物卡片直接显示种族、年龄与等级');

function parseChapterCount(md){
  const third=md.search(/^# 三、/m),intro=md.slice(0,third<0?0:third);
  const introCount=[...intro.matchAll(/^## ([一二]、.+)$/gm)].length;
  const main=[...md.matchAll(/^# (.+)$/gm)].filter(m=>!m[1].startsWith('《')).length;
  return introCount+main;
}
const lore=read('assets/world-lore.md'),chapterCount=parseChapterCount(lore);
check(chapterCount===48,'world-lore.md 共48个网页主章节',chapterCount);
check(exists('assets/world-demography.md')&&/^# 四十五、人口、聚落与文明密度/m.test(lore),'人口独立文件与完整目录第四十五章仍保留');
check(/CHAPTERS\.length/.test(worldHtml)&&!/(四十二章|42章|四十二个主章节)/.test(worldHtml),'网页章节统计读取 CHAPTERS.length 且无42章硬编码');

const requiredViews=['culture','military','ecology','current'];
const absentViews=requiredViews.filter(v=>!new RegExp(`['"]${v}['"]`).test(worldHtml));
check(!absentViews.length&&/renderLorePage\(view\)/.test(worldHtml),'新导航均有对应渲染路径',absentViews.join('、'));

const mapHtml=read('map.html');
check(['精灵族政权','兽人族政权','矮人族政权','城邦与联盟'].every(x=>mapHtml.includes(x))&&!mapHtml.includes('兽人、矮人与山地政权'),'地图图例拆分精灵、兽人、矮人与城邦联盟');
check(/'兽人国家':'#a06d3d'/.test(mapHtml)&&/'矮人高山王国':'#667f96'/.test(mapHtml),'兽人和矮人政权使用不同地图颜色');
check(/\['主要族群',o\.peoples\]/.test(mapHtml)&&/x\.type\+' · '\+x\.peoples/.test(mapHtml),'地图详情与搜索结果显示主要族群');

const localLinks=[];
for(const file of ['world.html','map.html','world-person.html','assets/world-lore.md','assets/world-culture.md','assets/world-demography.md','assets/world-military.md','assets/world-ecology.md','assets/world-current.md']){
  const body=read(file);
  const htmlLinks=[...body.matchAll(/(?:href|src)=['"]([^'"]+)['"]/g)].map(m=>m[1]);
  const mdLinks=[...body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(m=>m[1]);
  for(const raw of [...htmlLinks,...mdLinks]){
    if(/^(?:https?:|data:|mailto:|#|javascript:|\$)/.test(raw)||/[+`]/.test(raw)||raw.includes('${'))continue;
    const clean=raw.split(/[?#]/)[0];if(!clean)continue;
    const base=file.endsWith('.md')?'':path.dirname(file),target=path.normalize(path.join(base,clean));
    if(!exists(target))localLinks.push(`${file} → ${raw}`);
  }
}
check(!localLinks.length,'未发现明显失效的本地链接',localLinks.slice(0,15).join('；'));

const languageFiles=['assets/world-outsiders.md','assets/world-culture.md','assets/world-lore.md'];
const languageMissing=[];
for(const file of languageFiles){const body=read(file);for(const term of ['大陆通用语','听说','文字','实时翻译','地球语言'])if(!body.includes(term))languageMissing.push(`${file}:${term}`)}
check(!languageMissing.length,'语言硬规则已同步到三份指定资料',languageMissing.join('、'));

const protectedExact=new Set(['assets/timeline.txt.gz','assets/characters.txt.gz','assets/status.txt.gz','index.html']);
try{
  const changed=execFileSync('git',['diff','--name-only','origin/main','--'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const forbidden=changed.filter(p=>protectedExact.has(p)||/(^|\/)(新双陆世界正史|正史)(\/|$)/.test(p));
  check(!forbidden.length,'RP动态档案与正史目录未被修改',forbidden.join('、'));
}catch(error){warnings.push('无法通过 git diff 检查保护文件：'+error.message)}

console.log(`\n双陆世界资料审计：${pass.length} 项通过，${failures.length} 项失败，${warnings.length} 项警告。`);
for(const item of pass)console.log('  ✓ '+item);
for(const item of warnings)console.warn('  ! '+item);
for(const item of failures)console.error('  ✗ '+item);
if(failures.length)process.exit(1);
