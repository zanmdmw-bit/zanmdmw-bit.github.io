/* 黑鸦领与灰石镇多级矢量地图引擎。
 * 所有尺寸仍以公里为单位；地貌、建筑和标签会按缩放级别分别出现。
 * 这里不使用整张插画拉伸，因此任何层级都不会因放大而像素化。
 */
const WORLD_LOCAL_MAP_ENGINE=(()=>{
  const regionBox={x:19460,y:12390,w:1040,h:950};
  const terrainZones=[
    {kind:'region-plain',points:[[19470,12420],[19920,12410],[20035,12635],[19962,12940],[19780,13180],[19475,13140]],name:'黑羽河谷平原'},
    {kind:'region-highland',points:[[19915,12405],[20475,12400],[20490,13070],[20225,13125],[19955,12935],[20020,12630]],name:'灰骨岭与铜岭山地'},
    {kind:'region-forest',points:[[19510,12440],[19830,12410],[19895,12635],[19730,12770],[19480,12710]],name:'北鸦森林'},
    {kind:'region-forest',points:[[19920,12710],[20170,12610],[20285,12815],[20120,12920],[19935,12885]],name:'灰骨针叶林'},
    {kind:'region-marsh',points:[[19470,12900],[19705,12820],[19870,13020],[19825,13310],[19465,13320]],name:'苇泽低地'},
    {kind:'region-badland',points:[[19865,12910],[20270,12865],[20365,13220],[19955,13320]],name:'东南采石荒地'},
    {kind:'region-hill',points:[[19470,12620],[19620,12510],[19750,12680],[19705,12920],[19465,12960]],name:'赤松丘陵'}
  ];
  const ridgeLines=[
    [[19970,12430],[20020,12525],[20005,12620],[20070,12715],[20055,12815]],
    [[20115,12415],[20165,12520],[20140,12635],[20205,12755],[20175,12880]],
    [[20265,12420],[20305,12560],[20280,12690],[20345,12820],[20310,13010]],
    [[20025,12910],[20095,12980],[20125,13115],[20215,13210]]
  ];
  const tributaries=[
    [[19765,12435],[19788,12525],[19816,12610],[19835,12690]],
    [[20045,12500],[19995,12605],[19962,12720],[19925,12815]],
    [[20245,12705],[20180,12805],[20095,12895],[19995,12955]],
    [[19605,13085],[19710,13020],[19805,12965],[19862,12928]]
  ];
  const fineRoads=[
    [[19880,12910],[19875,12903],[19872,12896],[19874,12888]],
    [[19880,12910],[19888,12912],[19896,12914],[19904,12916]],
    [[19880,12910],[19878,12918],[19879,12926],[19883,12934]],
    [[19880,12910],[19870,12911],[19860,12914],[19851,12918]]
  ];
  const landmarkClear=[
    [19878.55,12909.93,.18],[19880.08,12910.02,.23],[19880.72,12910.10,.17],
    [19881.05,12910.82,.22],[19879.45,12910.48,.17],[19880.72,12909.18,.20]
  ];
  let buildingCache=null,fieldCache=null,treeCache=null,mountainCache=null;

  function rng(seed){let s=seed>>>0;return()=>((s=Math.imul(1664525,s)+1013904223>>>0)/4294967296)}
  function bbox(poly){const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}}
  function pointIn(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside}return inside}
  function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;if(!l)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)}
  function nearRoad(p,roads,gap){return roads.some(r=>r.slice(1).some((q,i)=>segDist(p,r[i],q)<gap))}
  function pathD(points,close=false){return points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ')+(close?' Z':'')}
  function scatter(poly,count,seed,minGap=0){const r=rng(seed),b=bbox(poly),out=[];for(let n=0;n<count*35&&out.length<count;n++){const p=[b.x+r()*b.w,b.y+r()*b.h];if(!pointIn(p,poly))continue;if(minGap&&out.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<minGap))continue;out.push(p)}return out}
  function addDefs(defs,E,D){
    const patterns=[
      ['localGrain',18,18,'#b4a878','M0 4L18 1 M2 15L16 12',.12],
      ['fieldLines',1.4,1.4,'#80754c','M0 .25L1.4 .25 M0 .75L1.4 .75 M0 1.25L1.4 1.25',.34],
      ['marshLines',4,4,'#567468','M0 3Q1.2 1.6 2.4 3T4.8 3',.38],
      ['quarryLines',5,5,'#756b5c','M-1 5L5 -1 M1 7L7 1',.32],
      ['roofLines',.08,.08,'#3e342b','M0 .04L.08 .04',.18]
    ];
    patterns.forEach(([id,w,h,color,d,op])=>{const p=E('pattern',{id,width:w,height:h,patternUnits:'userSpaceOnUse'});p.append(E('rect',{width:w,height:h,fill:'transparent'}),E('path',{d,stroke:color,'stroke-width':w*.05,opacity:op}));defs.append(p)});
    const localGrad=E('radialGradient',{id:'localMapFade',cx:'.5',cy:'.5',r:'.72'});localGrad.append(E('stop',{offset:'.82','stop-color':'white'}),E('stop',{offset:'1','stop-color':'black'}));
    const localMask=E('mask',{id:'localMapMask',maskContentUnits:'objectBoundingBox'});localMask.append(E('rect',{x:0,y:0,width:1,height:1,fill:'url(#localMapFade)'}));defs.append(localGrad,localMask);
    const clip=E('clipPath',{id:'graystoneTownClip'});clip.append(E('path',{d:pathD(D.townGeometry.wall,true)}));defs.append(clip);
  }

  function makeCaches(D){
    if(!treeCache){
      treeCache=[];terrainZones.filter(z=>z.kind==='region-forest').forEach((z,i)=>scatter(z.points,i?190:230,5100+i,3.1).forEach((p,n)=>treeCache.push({x:p[0],y:p[1],s:1.8+(n%7)*.28,conifer:i===1})));
    }
    if(!mountainCache){const zone=terrainZones.find(z=>z.kind==='region-highland');mountainCache=scatter(zone.points,175,7712,5.4).map((p,i)=>({x:p[0],y:p[1],s:5.6+(i%9)*.72}))}
    if(!fieldCache){
      const r=rng(8119);fieldCache=[];
      [[19848,12886,70,55],[19842,12903,54,46],[19855,12920,72,44],[19886,12880,70,46],[19890,12918,72,52],[19792,12848,86,58],[19805,13062,95,54]].forEach((a,bi)=>{
        for(let i=0;i<16;i++){const w=2.8+r()*6.2,h=1.8+r()*4.2,x=a[0]+r()*a[2],y=a[1]+r()*a[3];fieldCache.push({x,y,w,h,rot:(r()-.5)*22,c:(i+bi)%4})}
      })
    }
    if(!buildingCache){
      const wall=D.townGeometry.wall,roads=[...D.townGeometry.roads,...fineRoads],r=rng(92741),b=bbox(wall),palette=['#8e654c','#725a49','#9a7857','#66564c','#a17b55','#7f6a56'];buildingCache=[];
      for(let n=0;n<42000&&buildingCache.length<720;n++){
        const x=b.x+r()*b.w,y=b.y+r()*b.h,p=[x,y];
        if(!pointIn(p,wall)||nearRoad(p,roads,.055))continue;
        if(landmarkClear.some(q=>Math.hypot(q[0]-x,q[1]-y)<q[2]))continue;
        const w=.022+r()*.042,h=.016+r()*.032,rot=Math.round((r()-.5)*34);
        if(buildingCache.some(o=>Math.abs(o.x-x)<(o.w+w)*.7&&Math.abs(o.y-y)<(o.h+h)*.7))continue;
        buildingCache.push({x,y,w,h,rot,fill:palette[Math.floor(r()*palette.length)],ridge:r()>.32})
      }
    }
  }

  function renderRegional(ctx,g,sc){const {E,D,view}=ctx;
    const base=E('g',{mask:'url(#localMapMask)',class:'local-map-base'});base.append(E('rect',{x:regionBox.x,y:regionBox.y,width:regionBox.w,height:regionBox.h,fill:'#c7bd8b'}));if(sc<780)base.append(E('rect',{x:regionBox.x,y:regionBox.y,width:regionBox.w,height:regionBox.h,fill:'url(#localGrain)'}));
    const fills={'region-plain':'#c8c18c','region-highland':'#9c9678','region-forest':'#7f916d','region-marsh':'#7d9784','region-badland':'#ad9b78','region-hill':'#aaa579'};
    const zoneStroke=sc<300?1.2:sc<780?.3:.012;terrainZones.forEach(z=>base.append(E('path',{d:pathD(z.points,true),class:z.kind,fill:fills[z.kind],stroke:'rgba(71,62,45,.20)','stroke-width':zoneStroke})));
    if(sc<780){tributaries.forEach(r=>base.append(E('path',{d:pathD(r),fill:'none',stroke:'#6d92a0','stroke-width':1.3,'stroke-linecap':'round',opacity:.8})));
      const river=D.localRoads.find(r=>r.kind==='river-local');if(river)base.append(E('path',{d:pathD(river.points),fill:'none',stroke:'#506f7d','stroke-width':4.2,'stroke-linecap':'round','stroke-linejoin':'round'}),E('path',{d:pathD(river.points),fill:'none',stroke:'#7fa4ae','stroke-width':2.6,'stroke-linecap':'round','stroke-linejoin':'round'}));
      ridgeLines.forEach(r=>base.append(E('path',{d:pathD(r),fill:'none',stroke:'#756d5d','stroke-width':1.1,'stroke-dasharray':'5 4',opacity:.55})))}
    g.append(base);
    if(sc>=780)return;
    const symbols=E('g',{class:'regional-symbols'});
    mountainCache.forEach((m,i)=>{if(sc<145&&i%3)return;const s=m.s;symbols.append(E('path',{d:`M${m.x-s} ${m.y+s*.65}L${m.x} ${m.y-s}L${m.x+s} ${m.y+s*.65}L${m.x+s*.35} ${m.y+s*.3}L${m.x} ${m.y-s*.2}L${m.x-s*.25} ${m.y+s*.26}Z`,fill:'#8b8372',stroke:'#5e584e','stroke-width':.65,opacity:.9}))});
    treeCache.forEach((t,i)=>{if(sc<145&&i%4)return;const s=t.s;if(t.conifer){symbols.append(E('path',{d:`M${t.x} ${t.y-s}L${t.x-s*.72} ${t.y+s*.55}L${t.x+s*.72} ${t.y+s*.55}Z`,fill:'#516b57',stroke:'#3f5647','stroke-width':.28}))}else{symbols.append(E('circle',{cx:t.x,cy:t.y,r:s*.66,fill:'#617b59',stroke:'#465c45','stroke-width':.3}),E('circle',{cx:t.x-s*.42,cy:t.y+s*.18,r:s*.42,fill:'#718963'}))}});
    if(sc>=115){fieldCache.forEach(f=>symbols.append(E('rect',{x:f.x,y:f.y,width:f.w,height:f.h,rx:.25,fill:['#c3b36c','#b6aa72','#d0bf78','#a9a06c'][f.c],stroke:'#817956','stroke-width':.22,transform:`rotate(${f.rot} ${f.x+f.w/2} ${f.y+f.h/2})`})))}
    if(sc>=180){terrainZones.filter(z=>z.kind==='region-marsh').forEach(z=>symbols.append(E('path',{d:pathD(z.points,true),fill:'url(#marshLines)',opacity:.7})));terrainZones.filter(z=>z.kind==='region-badland').forEach(z=>symbols.append(E('path',{d:pathD(z.points,true),fill:'url(#quarryLines)',opacity:.72})))}
    g.append(symbols);
    if(sc<190){const labels=E('g',{class:'regional-terrain-labels'}),fs=view.w*.013;terrainZones.forEach(z=>{const b=bbox(z.points);labels.append(E('text',{x:b.x+b.w/2,y:b.y+b.h/2,'text-anchor':'middle','font-size':fs,fill:'#51493f','font-weight':800,'letter-spacing':fs*.08,opacity:.78},z.name))});g.append(labels)}
  }

  function renderHinterland(ctx,g,sc){const {E}=ctx,r=rng(4612),fields=E('g',{class:'graystone-hinterland'});
    fields.append(E('rect',{x:19870,y:12902,width:20,height:16,rx:2.5,fill:'#aeb37b',opacity:.5}));
    for(let i=0;i<92;i++){const x=19870+r()*20,y=12902+r()*16;if(x>19877&&x<19883.5&&y>12907&&y<12913)continue;const w=.22+r()*.65,h=.14+r()*.48,rot=(r()-.5)*28;fields.append(E('rect',{x,y,width:w,height:h,rx:.03,fill:i%3?'#c4b778':'#aeb175',stroke:'#7f7955','stroke-width':.025,transform:`rotate(${rot} ${x+w/2} ${y+h/2})`}),E('rect',{x,y,width:w,height:h,fill:'url(#fieldLines)',opacity:.45,transform:`rotate(${rot} ${x+w/2} ${y+h/2})`}))}
    for(let i=0;i<70;i++){const x=19870.5+r()*19,y=12902.5+r()*15;if(x>19877&&x<19883.5&&y>12907&&y<12913)continue;fields.append(E('circle',{cx:x,cy:y,r:.055+r()*.045,fill:'#55704f',opacity:.8}))}
    g.append(fields)
  }

  function renderTown(ctx,g,sc){const {E,D}=ctx,t=D.townGeometry,wall=t.wall,town=E('g',{class:'graystone-vector-town'});
    town.append(E('path',{d:pathD(wall,true),fill:'#c5ab7e',stroke:'#473c33','stroke-width':.075,'stroke-linejoin':'round'}));
    t.wards.forEach((w,i)=>town.append(E('path',{d:pathD(w.points,true),fill:['#bfa77c','#b8a27a','#c8ae7e','#b99b70','#bda57d'][i],opacity:.82,stroke:'#806d55','stroke-width':.018})));
    fineRoads.forEach((r,i)=>town.append(E('path',{d:pathD(r),fill:'none',stroke:'#d8c597','stroke-width':i?.075:.11,'stroke-linecap':'round','stroke-linejoin':'round'})));
    t.roads.forEach((r,i)=>town.append(E('path',{d:pathD(r),fill:'none',stroke:'#ede0b9','stroke-width':i<2?.13:.09,'stroke-linecap':'round','stroke-linejoin':'round'})));
    const buildings=E('g',{'clip-path':'url(#graystoneTownClip)',class:'town-buildings'});
    buildingCache.forEach(b=>{const rect=E('rect',{x:b.x-b.w/2,y:b.y-b.h/2,width:b.w,height:b.h,rx:.003,fill:b.fill,stroke:'#41382f','stroke-width':.006,transform:`rotate(${b.rot} ${b.x} ${b.y})`});buildings.append(rect);if(sc>=7600&&b.ridge)buildings.append(E('path',{d:`M${b.x-b.w*.34} ${b.y}L${b.x+b.w*.34} ${b.y}`,stroke:'#d6b98a','stroke-width':.004,transform:`rotate(${b.rot} ${b.x} ${b.y})`,opacity:.75}))});town.append(buildings);
    // 关键地点采用真实院落轮廓，避免只剩一个圆点。
    town.append(
      E('rect',{x:19878.37,y:12909.78,width:.36,height:.28,rx:.018,fill:'#9d815e',stroke:'#514238','stroke-width':.015}),
      E('rect',{x:19878.42,y:12909.82,width:.18,height:.085,fill:'#765642',stroke:'#3f332b','stroke-width':.008}),
      E('path',{d:'M19878.44 12909.96L19878.68 12909.96M19878.46 12910.01L19878.69 12910.01',stroke:'#5e4938','stroke-width':.012}),
      E('rect',{x:19879.87,y:12909.88,width:.42,height:.30,rx:.025,fill:'#d8c493',stroke:'#6d5946','stroke-width':.016}),
      E('rect',{x:19880.60,y:12909.98,width:.25,height:.20,rx:.018,fill:'#70584a',stroke:'#3d332d','stroke-width':.014}),
      E('rect',{x:19880.82,y:12910.58,width:.48,height:.43,rx:.025,fill:'#aa9a83',stroke:'#52473c','stroke-width':.018}),
      E('rect',{x:19879.28,y:12910.36,width:.34,height:.25,rx:.018,fill:'#80634f',stroke:'#473a31','stroke-width':.014}),
      E('rect',{x:19880.48,y:12909.02,width:.47,height:.28,rx:.018,fill:'#76685b',stroke:'#403932','stroke-width':.016})
    );
    wall.forEach((p,i)=>{if(i%1===0)town.append(E('circle',{cx:p[0],cy:p[1],r:.055,fill:'#66594b',stroke:'#342e29','stroke-width':.012}))});
    [[19881.72,12910.08],[19878.28,12910.08],[19880.05,12908.72],[19880.08,12911.35]].forEach((p,i)=>town.append(E('rect',{x:p[0]-.075,y:p[1]-.055,width:.15,height:.11,rx:.015,fill:'#5d4e43',stroke:'#2f2925','stroke-width':.014,transform:`rotate(${i===0||i===1?90:0} ${p[0]} ${p[1]})`})));
    if(sc>=6200){const street=E('g',{class:'street-furniture'}),r=rng(713);for(let i=0;i<110;i++){const x=19878.45+r()*3.05,y=12908.92+r()*2.22;if(!pointIn([x,y],wall)||nearRoad([x,y],t.roads,.035))continue;street.append(E('circle',{cx:x,cy:y,r:.008+r()*.006,fill:i%4?'#52664c':'#7f6c52'}))}town.append(street)}
    g.append(town)
  }

  function render(ctx){const {D,E,S,scale}=ctx,sc=scale();if(sc<45)return;makeCaches(D);const defs=S.querySelector('defs');if(defs)addDefs(defs,E,D);const g=E('g',{id:'localDetailLayers','pointer-events':'none'});renderRegional(ctx,g,sc);if(sc>=780)renderHinterland(ctx,g,sc);if(sc>=2500)renderTown(ctx,g,sc);S.append(g)}
  return{render,regionBox};
})();
