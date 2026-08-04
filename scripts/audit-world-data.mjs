#!/usr/bin/env node
/**
 * 双陆世界资料库零依赖审计。
 *
 * 运行：node scripts/audit-world-data.mjs
 * 要求：Node.js 18+；不需要安装任何 npm 包。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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

function walk(dir,base=''){
  const result=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const rel=path.join(base,entry.name).split(path.sep).join('/');
    if(entry.isDirectory())result.push(...walk(path.join(dir,entry.name),rel));
    else result.push(rel);
  }
  return result;
}

function readRuleFile(rel){
  const absolute=path.join(root,rel);
  return rel.endsWith('.gz')?zlib.gunzipSync(fs.readFileSync(absolute)).toString('utf8'):fs.readFileSync(absolute,'utf8');
}

function upgradeNeed(level){
  if(level<1||level>99)throw new RangeError('升级计算仅适用于Lv.1—99');
  const multiplier=level<=20?100:level<=40?200:level<=60?500:level<=80?1000:2000;
  return level*level*multiplier;
}

function levelDifferenceMultiplier(killerLevel,targetLevel){
  const delta=targetLevel-killerLevel;
  if(delta<=-10)return 0;
  if(delta<=-5)return 0.1;
  if(delta<=-3)return 0.3;
  if(delta<=-1)return 0.7;
  if(delta===0)return 1;
  if(delta<=2)return 1.5;
  if(delta<=5)return 2.5;
  if(delta<=10)return 5;
  return 10;
}

const killExperience=(killerLevel,targetLevel,strengthMultiplier=1)=>targetLevel*100*strengthMultiplier*levelDifferenceMultiplier(killerLevel,targetLevel);

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

// 等级、经验、成长、神格与千叶系统规则审计。
const ruleExtensions=new Set(['.html','.js','.mjs','.md','.txt','.json','.gz']);
const ruleFiles=[
  ...walk(path.join(root,'assets'),'assets').filter(file=>ruleExtensions.has(path.extname(file))),
  ...fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isFile()&&ruleExtensions.has(path.extname(entry.name))).map(entry=>entry.name),
  'scripts/audit-rp-data.mjs'
].filter((file,index,all)=>file!=='scripts/audit-world-data.mjs'&&all.indexOf(file)===index);
const ruleEntries=[];
for(const file of ruleFiles){
  try{ruleEntries.push({file,body:readRuleFile(file)})}
  catch(error){warnings.push(`无法读取规则扫描文件 ${file}：${error.message}`)}
}
const power=read('assets/world-power.md');
const canonicalRules=power+'\n'+lore;
const filesMatching=pattern=>ruleEntries.filter(entry=>pattern.test(entry.body)).map(entry=>entry.file);

const forbiddenRulePatterns=[
  ['未残留“目标等级²×10”正式击杀公式',/目标等级\s*(?:²|\^2|\*\*\s*2)\s*[×x*]\s*10/i],
  ['未残留按团队贡献分配或平分击杀经验',/(?:根据伤害、控制、治疗、保护、牵制等实际贡献分配击杀经验|按(?:照)?(?:团队|队伍)?(?:实际)?贡献(?:比例)?(?:分配|平分)(?:击杀)?经验|谁造成伤害最多，谁提供关键控制)/],
  ['未残留所有等级统一N²×100',/(?:所有等级|全等级)[^。\n]{0,50}(?:N\s*²|当前等级\s*²)\s*[×x*]\s*100|升级所需经验[^。\n]{0,60}统一[^。\n]{0,20}(?:N\s*²|当前等级\s*²)\s*[×x*]\s*100/i],
  ['未残留凡人阶普通训练稳定增加面板经验',/(?:凡人阶|1[—-]20级)[^。\n]{0,100}(?:普通训练|重复训练|跑步|普通挥剑)[^。\n]{0,50}(?:稳定|直接)(?:增加|获得|提供)(?:面板|等级)?经验/],
  ['未残留“超凡阶以后所有修炼均不能获得经验”',/(?:超凡阶|21级以后)[^。\n]{0,100}(?:所有|任何)[^。\n]{0,20}修炼[^。\n]{0,30}(?:不能|无法)(?:获得|提供)经验/],
  ['未残留“主要击杀”作为经验归属标准',/主要击杀/],
  ['未以“已经不可逆致死”否定存活目标的最终击杀归属',/不可逆致死[^。\n]{0,40}(?:伪造|不能|无效)[^。\n]{0,20}(?:击杀|经验)/],
  ['未残留Lv.21经验上限44100',/(?:44[，,]?100|44100)\s*(?:点)?经验|\/\s*(?:44[，,]?100|44100)/]
];
for(const [label,pattern] of forbiddenRulePatterns){
  const hits=filesMatching(pattern);
  check(!hits.length,label,hits.join('、'));
}

check(/最后真正令目标从存活状态变为死亡状态的人/.test(power)&&/不按累计伤害、控制、治疗、保护或其他团队贡献分配/.test(power),'最终致死者独占击杀经验且不按贡献分配');
check(/毒药归下毒者/.test(power)&&/陷阱归布置者/.test(power)&&/若最终死因无法可靠判定，则不产生击杀经验/.test(power),'延迟致死与死因不明规则完整');
check(/凡人阶（1—20级）[^\n]*最直接、最稳定的面板经验来源是实际击杀生命体/.test(power)&&/普通挥剑[^。]*不会直接增加面板经验/.test(power),'凡人阶普通训练不直接提供面板经验');
check(/超凡阶及以上（21级以后）[^\n]*真正改变生命本质、超凡结构、灵魂强度、魔力结构或法则掌握程度的修炼缓慢获得面板经验/.test(power),'超凡阶以上生命质变修炼可以缓慢提供经验');
check(/修炼只有确实推动生命层次、超凡结构或法则掌握时，才可能转化为经验/.test(power),'高阶修炼经验以生命、结构或法则变化为条件');
check(/血脉觉醒[^。]*世界法则反馈时提供经验/.test(power)&&/获得材料、接受祝福或完成普通任务本身不会自动加经验/.test(power),'高阶资源、祝福与法则反馈经验具有质变条件');
check(/击杀经验、修炼经验和法则反馈经验必须分别记录来源/.test(power),'三类经验来源明确分账');
check(/普通植物、已经死亡的尸体、幻象/.test(power)&&/独立意识、灵魂、魔核、意识核心或亡灵本源/.test(power),'可提供击杀经验的生命核心边界明确');
check(/现行基础属性共有六项/.test(power)&&['力量','敏捷','体质','精神','魔力','感知'].every(name=>power.includes(`| ${name} |`)),'力量、敏捷、体质、精神、魔力、感知六项属性完整');
check(/普通健康成年人的单项属性通常为 \*\*8—12点\*\*，10点可视作平均水平/.test(power),'普通健康成年人单项8—12点且10点为平均');
check(/力量、敏捷、体质、精神、魔力与感知六项基础属性全部增加1点/.test(power)&&/5点可自由分配的属性/.test(power),'每次升级六项基础属性全部+1并获得5点自由属性');
check(/不能直接兑换知识、技能、法术、武器熟练度、战斗经验、语言或专业技术/.test(power),'自由属性点只能强化六项基础属性');
check(/单项属性达到30点[^。]*不等于整体生命进入超凡阶/.test(power)&&/身体、精神、灵魂、魔力和感知/.test(power),'单项30点不等于整体超凡');
check(/属性不是技能，等级不是职业，等级也不是血条/.test(power)&&/等级和属性都不等于绝对战斗力/.test(power),'属性、等级与战斗力边界明确');
check(/种族、体型、装备、技巧、经验、胆量、伤势、环境、情报、陷阱、毒药、配合与临场判断/.test(power),'现实胜负影响因素完整保留');
check(/普通本地人看不见别人的精确等级/.test(power),'普通人无法直接看见精确等级');

const upgradeCases=new Map([[1,100],[5,2500],[10,10000],[20,40000],[21,88200],[30,180000],[40,320000],[50,1250000],[60,1800000],[80,6400000],[89,15842000],[90,16200000],[99,19602000]]);
const badUpgradeCases=[...upgradeCases].filter(([level,expected])=>upgradeNeed(level)!==expected).map(([level,expected])=>`Lv.${level}→${level+1}: ${upgradeNeed(level)} / ${expected}`);
check(!badUpgradeCases.length,'分段升级公式的13个校验值全部正确',badUpgradeCases.join('；'));
for(const [level,expected] of [[21,88200],[50,1250000],[89,15842000],[99,19602000]]){
  const formatted=expected.toLocaleString('en-US');
  check(new RegExp(`Lv\\.${level}→${level+1}[^\\n]{0,30}${formatted}`).test(canonicalRules),`正式资料包含Lv.${level}→${level+1}＝${expected}`);
}
check(/Lv\.1—20\s*\|\s*N²×100/.test(power)&&/Lv\.21—40\s*\|\s*N²×200/.test(power)&&/Lv\.41—60\s*\|\s*N²×500/.test(power)&&/Lv\.61—80\s*\|\s*N²×1000/.test(power)&&/Lv\.81—99\s*\|\s*N²×2000/.test(power),'正式资料包含五段升级需求公式');
check(killExperience(30,30,1)===3000&&/30级角色击杀30级普通目标获得3,000经验/.test(power),'同级30级普通目标提供3000经验');
check(killExperience(30,30,10)===30000&&/击杀30级首领获得30,000经验/.test(power),'同级30级首领提供30000经验');
check(killExperience(30,20,1)===0&&/击杀20级普通目标时因目标低10级，经验为0/.test(power),'目标低击杀者10级及以上为0经验');
check(killExperience(30,33,1)===8250&&/击杀33级普通目标获得8,250经验/.test(power),'30级击杀33级普通目标提供8250经验');
check(/目标等级×100×目标强度倍率×等级差倍率/.test(power)&&/神话级单位\s*\|\s*×300以上/.test(power),'击杀经验公式与目标强度倍率已固定');
check(['×0','×10%','×30%','×70%','×100%','×150%','×250%','×500%','×1000%'].every(value=>power.includes(value)),'九档等级差倍率均存在');

check(/Lv\.81—89\s*\|\s*神话阶/.test(power),'阶段包含神话阶Lv.81—89');
check(/Lv\.90—99\s*\|\s*神祇阶/.test(power),'阶段包含神祇阶Lv.90—99');
check(/Lv\.100\s*\|\s*主神阶/.test(power),'阶段包含主神阶Lv.100');
check(/20→21、40→41、60→61、80→81、89→90与99→100/.test(power)&&/经验达到要求只代表拥有数值资格/.test(power),'六个跨阶节点均要求额外生命突破');
check(/“超凡核心”“英雄印记”“传奇领域”“神话真身”[^。]*通用概括/.test(power)&&/不同生命可以采用不同凝聚方式/.test(power),'四个突破名称保留为跨体系通用概括');

const god90=power.slice(power.indexOf('### 89级突破90级'),power.indexOf('### 99级突破100级'));
const god100=power.slice(power.indexOf('### 99级突破100级'),power.indexOf('## 时间、寿命与强者稀缺'));
check(/残破神格/.test(god90)&&/神格雏形/.test(god90)&&/等价神性核心/.test(god90)&&/仍不能自动成为90级神祇/.test(god90),'89→90要求残破神格、神格雏形或等价神性核心');
check(/残破神格只提供突破所需的神性结构，不等于完整神格/.test(god90)&&/神格反噬/.test(god90)&&/死亡/.test(god90),'残破神格边界与融合风险完整');
check(/完整、稳定且达到主神层次的神格/.test(god100)&&/核心神职或主要权柄/.test(god100)&&/仍不能自动进入主神阶/.test(god100),'99→100要求完整主神级神格和核心权柄');
check(/神国、神座、庞大信仰和世界锚点[^。]*不是所有主神完全统一的绝对条件/.test(god100),'神国、神座、信仰与锚点未被误设为统一绝对条件');
check(/神格是[^。]*神职是[^。]*权柄是/.test(god100)&&/不能完全等同/.test(god100),'神格、神职、权柄、神国、神座与信仰保持区分');
check(god100.includes('当前大陆已有九位100级主神')&&god100.includes('不是世界只能存在九位主神'),'九位主神是当前大陆数量而非世界上限');

const initialRows=Object.fromEntries([...power.matchAll(/^\|\s*(姓名|年龄|种族|穿越前职业|等级|经验|力量|敏捷|体质|精神|魔力|感知)\s*\|\s*([^|]+?)\s*\|$/gm)].map(match=>[match[1],match[2].trim()]));
check(initialRows.姓名==='千叶'&&initialRows.年龄==='25岁'&&initialRows.种族==='地球人'&&initialRows.穿越前职业==='流水线工人'&&initialRows.等级==='Lv.1'&&initialRows.经验==='0','千叶初始身份、等级与经验独立保留');
check(['力量','敏捷','体质','精神','魔力','感知'].map(key=>Number(initialRows[key])).join(',')==='12,10,12,10,9,10','千叶初始六项属性为12、10、12、10、9、10');
check(/开局没有本世界合法身份、本地货币、武器装备、固定住所、人脉关系、本世界系统知识和系统性战斗训练/.test(power),'千叶开局缺失项完整');
check(/初始自由属性点与初始生存点余额[^。]*不得自行填写/.test(power),'未擅自填写初始自由属性点和生存点');
check(/基础个人面板[^。]*不是千叶的金手指/.test(power)&&/只有千叶拥有【异世界生存系统】/.test(power),'普通穿越者面板与千叶专属系统明确区分');
check(/生存指标事后结算、物品回收和系统商城/.test(power)&&/不主动发布强制任务/.test(power),'系统三项初始核心功能与非强制任务口径完整');
check(/经验与生存点是两套独立机制/.test(power)&&/生存点用于系统商城/.test(power)&&/经验也不能当作生存点/.test(power),'经验与生存点用途和计算依据分离');
check(/商城不直接出售等级、经验或自由属性点/.test(power)&&/不能形成无成本无限刷点循环/.test(power),'商城、回收与倒卖边界完整');

const status=read('assets/status-current.txt');
const currentLevel=Number(status.match(/^等级：(\d+)级。?$/m)?.[1]);
const currentExperience=status.match(/^经验：(\d+)\/(\d+)。?$/m);
const currentEarned=Number(currentExperience?.[1]),currentCap=Number(currentExperience?.[2]);
check(Number.isInteger(currentLevel)&&Number.isInteger(currentEarned)&&Number.isInteger(currentCap),'当前状态等级与经验可解析');
check(currentCap===upgradeNeed(currentLevel),'当前状态经验上限符合对应等级的分段公式',`Lv.${currentLevel}: ${currentEarned}/${currentCap}，应为 /${upgradeNeed(currentLevel)}`);
check(currentLevel!==21||currentEarned===430,'Lv.21当前已有经验430保持不变',`${currentEarned}`);

// 历史记录缺少目标等级、强度或逐目标归属时，只发出警告，不强制回算。
const timeline=read('assets/timeline-current.txt');
const unresolvedHistory=[
  ['事件302','单目标经验270，但目标确切等级与强度类别未公开'],
  ['事件304','五个目标经验合计6060，但目标确切等级与强度类别未公开'],
  ['事件308','第62—68日52头目标使用日汇总经验，缺少逐目标等级、强度与逐项来源'],
  ['事件480','14只赤脊爪兽经验5180，缺少逐类目标确切等级与强度类别'],
  ['事件481','第二、三批共17只目标仅有批次汇总经验，缺少逐目标等级与强度类别'],
  ['事件488','千叶218次与公主28次最终击杀只有汇总经验，缺少逐目标等级、强度与逐项来源']
];
for(const [event,reason] of unresolvedHistory)if(timeline.includes(`【${event}】`))warnings.push(`历史经验未回算：${event}——${reason}；保留既有经验与升级时间`);

const protectedExact=new Set(['assets/timeline.txt.gz','assets/characters.txt.gz','assets/status.txt.gz','index.html']);
const allowedChanges=new Set([
  'assets/characters-current.txt','assets/status-current.txt','assets/story-475-490.json','assets/timeline-current.txt',
  'assets/world-lore.md','assets/world-overview.md','assets/world-people.js','assets/world-power.md',
  'person.html','scripts/audit-rp-data.mjs','scripts/audit-world-data.mjs','world-person.html','world.html'
]);
try{
  const changed=execFileSync('git',['diff','--name-only','origin/main','--'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const forbidden=changed.filter(p=>protectedExact.has(p)||/(^|\/)(新双陆世界正史|正史)(\/|$)/.test(p)||p.startsWith('shelter-map/'));
  const unrelated=changed.filter(p=>!allowedChanges.has(p));
  check(!forbidden.length,'正史、shelter-map、只读归档与入口文件未被修改',forbidden.join('、'));
  check(!unrelated.length,'修改范围仅限本轮网站与网站数据允许清单',unrelated.join('、'));
}catch(error){warnings.push('无法通过 git diff 检查保护文件：'+error.message)}

console.log(`\n双陆世界资料审计：${pass.length} 项通过，${failures.length} 项失败，${warnings.length} 项警告。`);
for(const item of pass)console.log('  ✓ '+item);
for(const item of warnings)console.warn('  ! '+item);
for(const item of failures)console.error('  ✗ '+item);
if(failures.length)process.exit(1);
