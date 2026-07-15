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
  const contourLines=[
    [[19936,12455],[19978,12518],[19972,12588],[20021,12642],[20012,12718]],
    [[19966,12428],[20024,12512],[20015,12602],[20062,12674],[20048,12762]],
    [[20042,12420],[20082,12505],[20075,12605],[20122,12688],[20105,12792]],
    [[20132,12418],[20166,12505],[20158,12610],[20212,12694],[20198,12810]],
    [[20215,12435],[20252,12532],[20236,12640],[20288,12732],[20272,12858]],
    [[19502,12676],[19556,12634],[19618,12642],[19665,12708],[19670,12782]],
    [[19488,12724],[19548,12688],[19608,12702],[19646,12772],[19642,12854]]
  ];
  const townLanes=[
    [[19878.55,12909.43],[19879.05,12909.72],[19879.55,12909.82]],
    [[19878.48,12909.76],[19879.02,12909.87],[19879.45,12910.02]],
    [[19878.52,12910.32],[19879.06,12910.26],[19879.62,12910.18]],
    [[19878.72,12910.72],[19879.18,12910.50],[19879.72,12910.28]],
    [[19879.18,12908.99],[19879.35,12909.42],[19879.52,12909.85]],
    [[19879.62,12908.86],[19879.66,12909.35],[19879.72,12909.82]],
    [[19880.42,12908.84],[19880.34,12909.30],[19880.20,12909.78]],
    [[19880.82,12908.97],[19880.66,12909.38],[19880.48,12909.82]],
    [[19880.38,12909.72],[19880.82,12909.70],[19881.24,12909.55]],
    [[19880.42,12910.20],[19880.88,12910.28],[19881.34,12910.30]],
    [[19880.35,12910.56],[19880.80,12910.64],[19881.28,12910.76]],
    [[19879.58,12910.38],[19879.52,12910.78],[19879.42,12911.08]],
    [[19879.92,12910.42],[19879.90,12910.86],[19879.86,12911.22]],
    [[19880.42,12910.46],[19880.34,12910.86],[19880.30,12911.20]]
  ];
  const landmarkClear=[
    [19878.55,12909.93,.18],[19880.08,12910.02,.23],[19880.72,12910.10,.17],
    [19881.05,12910.82,.22],[19879.45,12910.48,.17],[19880.72,12909.18,.20]
  ];
  let buildingCache=null,fieldCache=null,treeCache=null,mountainCache=null,outerBuildingCache=null,yardCache=null;

  function rng(seed){let s=seed>>>0;return()=>((s=Math.imul(1664525,s)+1013904223>>>0)/4294967296)}
  function bbox(poly){const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}}
  function pointIn(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))inside=!inside}return inside}
  function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;if(!l)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)}
  function nearRoad(p,roads,gap){return roads.some(r=>r.slice(1).some((q,i)=>segDist(p,r[i],q)<gap))}
  function pathD(points,close=false){return points.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ')+(close?' Z':'')}
  function curveD(points,close=false){if(points.length<3)return pathD(points,close);if(!close){let d=`M${points[0][0]} ${points[0][1]}`;for(let i=1;i<points.length-1;i++){const p=points[i],n=points[i+1];d+=` Q${p[0]} ${p[1]} ${(p[0]+n[0])/2} ${(p[1]+n[1])/2}`}const z=points[points.length-1];return d+` T${z[0]} ${z[1]}`}const mids=points.map((p,i)=>[(p[0]+points[(i+1)%points.length][0])/2,(p[1]+points[(i+1)%points.length][1])/2]);let d=`M${mids[mids.length-1][0]} ${mids[mids.length-1][1]}`;points.forEach((p,i)=>d+=` Q${p[0]} ${p[1]} ${mids[i][0]} ${mids[i][1]}`);return d+' Z'}
  function scatter(poly,count,seed,minGap=0){const r=rng(seed),b=bbox(poly),out=[];for(let n=0;n<count*35&&out.length<count;n++){const p=[b.x+r()*b.w,b.y+r()*b.h];if(!pointIn(p,poly))continue;if(minGap&&out.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<minGap))continue;out.push(p)}return out}
  function addDefs(defs,E,D){
    const patterns=[
      ['localGrain',18,18,'#b4a878','M0 4L18 1 M2 15L16 12',.12],
      ['fieldLines',1.4,1.4,'#80754c','M0 .25L1.4 .25 M0 .75L1.4 .75 M0 1.25L1.4 1.25',.34],
      ['fineFieldLines',.14,.14,'#756a42','M0 .025L.14 .025 M0 .075L.14 .075 M0 .125L.14 .125',.32],
      ['marshLines',4,4,'#567468','M0 3Q1.2 1.6 2.4 3T4.8 3',.38],
      ['quarryLines',5,5,'#756b5c','M-1 5L5 -1 M1 7L7 1',.32],
      ['roofLines',.08,.08,'#3e342b','M0 .04L.08 .04',.18],
      ['townCobbles',.12,.10,'#74634f','M.01 .03Q.035 .005 .07 .025T.12 .025 M-.02 .08Q.02 .055 .055 .078T.13 .075',.22],
      ['wallMasonry',.14,.09,'#3e342c','M0 .045H.14 M.04 0V.045 M.10 .045V.09',.28]
    ];
    patterns.forEach(([id,w,h,color,d,op])=>{const p=E('pattern',{id,width:w,height:h,patternUnits:'userSpaceOnUse'});p.append(E('rect',{width:w,height:h,fill:'transparent'}),E('path',{d,stroke:color,'stroke-width':w*.05,opacity:op}));defs.append(p)});
    const grass=E('pattern',{id:'grassTexture',width:7,height:7,patternUnits:'userSpaceOnUse'});grass.append(E('circle',{cx:1.1,cy:1.5,r:.18,fill:'#6f754c',opacity:.30}),E('circle',{cx:5.6,cy:4.8,r:.13,fill:'#e1d59b',opacity:.34}),E('path',{d:'M2.8 6L3.1 5.1M3.1 5.9L3.55 5.2M6.2 2.2L6.45 1.5',stroke:'#72784f','stroke-width':.12,opacity:.34}));defs.append(grass);
    const forest=E('pattern',{id:'forestFloor',width:9,height:9,patternUnits:'userSpaceOnUse'});forest.append(E('circle',{cx:2,cy:2,r:.45,fill:'#3f5b43',opacity:.22}),E('circle',{cx:6.5,cy:5.8,r:.6,fill:'#b9bd82',opacity:.16}),E('path',{d:'M1 7Q3.5 5.8 5.5 7T10 7',fill:'none',stroke:'#3f5641','stroke-width':.22,opacity:.26}));defs.append(forest);
    const dirt=E('pattern',{id:'townGround',width:.22,height:.22,patternUnits:'userSpaceOnUse'});dirt.append(E('rect',{width:.22,height:.22,fill:'#c6ae80'}),E('circle',{cx:.04,cy:.05,r:.008,fill:'#8b775a',opacity:.3}),E('circle',{cx:.17,cy:.14,r:.006,fill:'#e0c99a',opacity:.46}),E('path',{d:'M.03 .19L.09 .17M.13 .04L.20 .03',stroke:'#8f7a5d','stroke-width':.004,opacity:.24}));defs.append(dirt);
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
      const wall=D.townGeometry.wall,roads=[...D.townGeometry.roads,...fineRoads,...townLanes],r=rng(92741),b=bbox(wall),palette=['#8e654c','#725a49','#9a7857','#66564c','#a17b55','#7f6a56'];buildingCache=[];
      for(let n=0;n<42000&&buildingCache.length<720;n++){
        const x=b.x+r()*b.w,y=b.y+r()*b.h,p=[x,y];
        if(!pointIn(p,wall)||nearRoad(p,roads,.055))continue;
        if(landmarkClear.some(q=>Math.hypot(q[0]-x,q[1]-y)<q[2]))continue;
        const w=.022+r()*.042,h=.016+r()*.032,rot=Math.round((r()-.5)*34);
        if(buildingCache.some(o=>Math.abs(o.x-x)<(o.w+w)*.7&&Math.abs(o.y-y)<(o.h+h)*.7))continue;
        buildingCache.push({x,y,w,h,rot,fill:palette[Math.floor(r()*palette.length)],ridge:r()>.32})
      }
    }
    if(!outerBuildingCache){
      const r=rng(64812),palette=['#8a6b50','#9c7855','#765e4b','#a08361'];outerBuildingCache=[];
      const clusters=[[19882.05,12909.72,1.25,.78,72],[19877.20,12909.88,.75,.55,24],[19880.05,12912.02,.95,.48,28],[19879.78,12908.05,.75,.42,20]];
      clusters.forEach(([cx,cy,ww,hh,count],ci)=>{for(let i=0;i<count;i++){const x=cx+(r()-.5)*ww,y=cy+(r()-.5)*hh,w=.025+r()*.06,h=.018+r()*.038,rot=Math.round((r()-.5)*28);if(pointIn([x,y],D.townGeometry.wall)||nearRoad([x,y],fineRoads,.05))continue;outerBuildingCache.push({x,y,w,h,rot,fill:palette[(i+ci)%palette.length]})}})
    }
    if(!yardCache){
      const r=rng(11387),wall=D.townGeometry.wall;yardCache=[];
      for(let n=0;n<5000&&yardCache.length<130;n++){const x=19878.4+r()*3.15,y=12908.84+r()*2.4;if(!pointIn([x,y],wall)||nearRoad([x,y],D.townGeometry.roads,.05)||nearRoad([x,y],townLanes,.025))continue;if(buildingCache.some(b=>Math.hypot(b.x-x,b.y-y)<.045))continue;yardCache.push({x,y,kind:r()>.78?'well':r()>.45?'tree':'yard',s:.009+r()*.009})}
    }
  }

  function renderRegional(ctx,g,sc){const {E,D,view}=ctx;
    const base=E('g',{mask:'url(#localMapMask)',class:'local-map-base'});base.append(E('rect',{x:regionBox.x,y:regionBox.y,width:regionBox.w,height:regionBox.h,fill:'#c7bd8b'}));if(sc<780)base.append(E('rect',{x:regionBox.x,y:regionBox.y,width:regionBox.w,height:regionBox.h,fill:'url(#localGrain)'}));
    const fills={'region-plain':'#c8c18c','region-highland':'#9c9678','region-forest':'#7f916d','region-marsh':'#7d9784','region-badland':'#ad9b78','region-hill':'#aaa579'};
    const textures={'region-plain':'url(#grassTexture)','region-forest':'url(#forestFloor)','region-marsh':'url(#marshLines)','region-badland':'url(#quarryLines)','region-hill':'url(#grassTexture)'};
    const zoneStroke=sc<300?1.2:sc<780?.3:.012;terrainZones.forEach(z=>{const d=curveD(z.points,true);base.append(E('path',{d,class:z.kind,fill:fills[z.kind],stroke:'rgba(71,62,45,.20)','stroke-width':zoneStroke}));if(sc<780&&textures[z.kind])base.append(E('path',{d,fill:textures[z.kind],opacity:z.kind==='region-forest'?.55:.42}))});
    if(sc<780){tributaries.forEach(r=>base.append(E('path',{d:pathD(r),fill:'none',stroke:'#6d92a0','stroke-width':1.3,'stroke-linecap':'round',opacity:.8})));
      const river=D.localRoads.find(r=>r.kind==='river-local');if(river)base.append(E('path',{d:pathD(river.points),fill:'none',stroke:'#506f7d','stroke-width':4.2,'stroke-linecap':'round','stroke-linejoin':'round'}),E('path',{d:pathD(river.points),fill:'none',stroke:'#7fa4ae','stroke-width':2.6,'stroke-linecap':'round','stroke-linejoin':'round'}));
      ridgeLines.forEach(r=>base.append(E('path',{d:curveD(r),fill:'none',stroke:'#756d5d','stroke-width':1.1,'stroke-dasharray':'5 4',opacity:.55})));contourLines.forEach((r,i)=>base.append(E('path',{d:curveD(r),fill:'none',stroke:i<5?'#6f695d':'#777251','stroke-width':.48,'stroke-dasharray':i%2?'2.4 2':'','stroke-linecap':'round',opacity:.46})))}
    g.append(base);
    if(sc>=780)return;
    const symbols=E('g',{class:'regional-symbols'});
    mountainCache.forEach((m,i)=>{if(sc<145&&i%2)return;const s=m.s*(sc<100?1.16:1),d=`M${m.x-s} ${m.y+s*.65}L${m.x} ${m.y-s}L${m.x+s} ${m.y+s*.65}L${m.x+s*.35} ${m.y+s*.3}L${m.x} ${m.y-s*.2}L${m.x-s*.25} ${m.y+s*.26}Z`;symbols.append(E('path',{d,fill:'#8b8372',stroke:'#554f47','stroke-width':.65,opacity:.94}),E('path',{d:`M${m.x} ${m.y-s}L${m.x-s*.25} ${m.y+s*.26}L${m.x-s} ${m.y+s*.65}M${m.x} ${m.y-s*.2}L${m.x+s*.35} ${m.y+s*.3}`,fill:'none',stroke:'#c1b89f','stroke-width':.42,opacity:.62}))});
    treeCache.forEach((t,i)=>{if(sc<145&&i%2)return;const s=t.s*(sc<100?1.85:sc<145?1.35:1);if(t.conifer){symbols.append(E('ellipse',{cx:t.x+.3,cy:t.y+s*.52,rx:s*.62,ry:s*.24,fill:'#34463a',opacity:.22}),E('path',{d:`M${t.x} ${t.y-s}L${t.x-s*.72} ${t.y+s*.55}L${t.x+s*.72} ${t.y+s*.55}Z`,fill:'#516b57',stroke:'#344b3c','stroke-width':.28}),E('path',{d:`M${t.x} ${t.y-s*.72}L${t.x-s*.42} ${t.y+s*.28}L${t.x} ${t.y+s*.12}`,fill:'#748769',opacity:.66}))}else{symbols.append(E('ellipse',{cx:t.x+.35,cy:t.y+s*.52,rx:s*.68,ry:s*.25,fill:'#384a3b',opacity:.2}),E('circle',{cx:t.x,cy:t.y,r:s*.66,fill:'#617b59',stroke:'#405641','stroke-width':.3}),E('circle',{cx:t.x-s*.42,cy:t.y+s*.18,r:s*.42,fill:'#718963'}),E('circle',{cx:t.x+s*.18,cy:t.y-s*.25,r:s*.26,fill:'#91a078',opacity:.75}))}});
    if(sc>=115){fieldCache.forEach(f=>{const tr=`rotate(${f.rot} ${f.x+f.w/2} ${f.y+f.h/2})`;symbols.append(E('rect',{x:f.x+.35,y:f.y+.38,width:f.w,height:f.h,rx:.25,fill:'#625d45',opacity:.18,transform:tr}),E('rect',{x:f.x,y:f.y,width:f.w,height:f.h,rx:.25,fill:['#c3b36c','#b6aa72','#d0bf78','#a9a06c'][f.c],stroke:'#817956','stroke-width':.22,transform:tr}),E('rect',{x:f.x,y:f.y,width:f.w,height:f.h,rx:.25,fill:'url(#fieldLines)',opacity:.46,transform:tr}))})}
    if(sc>=180){terrainZones.filter(z=>z.kind==='region-marsh').forEach(z=>symbols.append(E('path',{d:pathD(z.points,true),fill:'url(#marshLines)',opacity:.7})));terrainZones.filter(z=>z.kind==='region-badland').forEach(z=>symbols.append(E('path',{d:pathD(z.points,true),fill:'url(#quarryLines)',opacity:.72})))}
    g.append(symbols);
    if(sc<190){const labels=E('g',{class:'regional-terrain-labels'}),fs=view.w*.013;terrainZones.forEach(z=>{const b=bbox(z.points);labels.append(E('text',{x:b.x+b.w/2,y:b.y+b.h/2,'text-anchor':'middle','font-size':fs,fill:'#51493f','font-weight':800,'letter-spacing':fs*.08,opacity:.78},z.name))});g.append(labels)}
  }

  function renderHinterland(ctx,g,sc){const {E}=ctx,r=rng(4612),fields=E('g',{class:'graystone-hinterland'});
    fields.append(E('rect',{x:19870,y:12902,width:20,height:16,rx:2.5,fill:'#aeb37b',opacity:.72}),E('rect',{x:19870,y:12902,width:20,height:16,rx:2.5,fill:'url(#grassTexture)',opacity:.48}));
    const lowContours=[
      [[19870.4,12904.1],[19874.0,12903.2],[19877.0,12903.6],[19879.0,12904.7]],
      [[19884.0,12903.4],[19886.7,12904.0],[19889.2,12905.6]],
      [[19870.2,12915.2],[19873.4,12914.1],[19876.2,12914.4]],
      [[19884.0,12915.0],[19887.1,12914.4],[19889.7,12913.1]]
    ];lowContours.forEach(p=>fields.append(E('path',{d:curveD(p),fill:'none',stroke:'#6f7653','stroke-width':.035,'stroke-dasharray':'.18 .12',opacity:.45})));
    for(let i=0;i<112;i++){const x=19870+r()*20,y=12902+r()*16;if(x>19877&&x<19883.5&&y>12907&&y<12913)continue;const w=.22+r()*.65,h=.14+r()*.48,rot=(r()-.5)*28,tr=`rotate(${rot} ${x+w/2} ${y+h/2})`;fields.append(E('rect',{x:x+.025,y:y+.028,width:w,height:h,rx:.03,fill:'#5d5944',opacity:.16,transform:tr}),E('rect',{x,y,width:w,height:h,rx:.03,fill:i%3?'#c4b778':'#aeb175',stroke:'#7f7955','stroke-width':.025,transform:tr}),E('path',{d:`M${x+.04} ${y+h*.34}H${x+w-.04}M${x+.04} ${y+h*.66}H${x+w-.04}`,fill:'none',stroke:'#756a42','stroke-width':.012,opacity:.38,transform:tr}))}
    for(let i=0;i<108;i++){const x=19870.5+r()*19,y=12902.5+r()*15;if(x>19877&&x<19883.5&&y>12907&&y<12913)continue;const rr=.04+r()*.055;fields.append(E('circle',{cx:x+.025,cy:y+.025,r:rr,fill:'#344638',opacity:.22}),E('circle',{cx:x,cy:y,r:rr,fill:i%4?'#55704f':'#6f7e51',stroke:'#435a42','stroke-width':.008,opacity:.92}))}
    for(let i=0;i<34;i++){const x=19870.4+r()*19.2,y=12902.4+r()*15.2,len=.35+r()*1.2,ang=(r()-.5)*.8,dx=Math.cos(ang)*len,dy=Math.sin(ang)*len;fields.append(E('path',{d:`M${x} ${y}Q${x+dx*.48} ${y+dy*.52+(r()-.5)*.16} ${x+dx} ${y+dy}`,fill:'none',stroke:'#4c6647','stroke-width':.028,'stroke-linecap':'round',opacity:.76}))}
    if(sc>=1250){const farms=E('g',{class:'hinterland-buildings'});outerBuildingCache.forEach(b=>{const tr=`rotate(${b.rot} ${b.x} ${b.y})`;farms.append(E('rect',{x:b.x-b.w/2+.012,y:b.y-b.h/2+.012,width:b.w,height:b.h,rx:.004,fill:'#403b32',opacity:.22,transform:tr}),E('rect',{x:b.x-b.w/2,y:b.y-b.h/2,width:b.w,height:b.h,rx:.004,fill:b.fill,stroke:'#4a3b31','stroke-width':.006,transform:tr}),E('path',{d:`M${b.x-b.w*.38} ${b.y}L${b.x+b.w*.38} ${b.y}`,stroke:'#d0b384','stroke-width':.004,transform:tr,opacity:.7}))});fields.append(farms)}
    g.append(fields)
  }

  function renderTown(ctx,g,sc){const {E,D}=ctx,t=D.townGeometry,wall=t.wall,town=E('g',{class:'graystone-vector-town'});
    const wallD=pathD(wall,true);town.append(E('path',{d:wallD,fill:'#c5ad80',stroke:'none'}));
    const ground=E('g',{'clip-path':'url(#graystoneTownClip)',class:'town-ground-texture'}),gr=rng(27109);for(let i=0;i<230;i++){const x=19878.3+gr()*3.45,y=12908.72+gr()*2.7;if(!pointIn([x,y],wall))continue;if(i%3)ground.append(E('circle',{cx:x,cy:y,r:.003+gr()*.003,fill:'#7f6d53',opacity:.30}));else ground.append(E('path',{d:`M${x} ${y}l${.012+gr()*.018} ${-.004+gr()*.008}`,stroke:'#e0c89b','stroke-width':.0025,opacity:.46}))}town.append(ground);
    t.wards.forEach((w,i)=>town.append(E('path',{d:curveD(w.points,true),fill:['#bfa77c','#b8a27a','#c8ae7e','#b99b70','#bda57d'][i],opacity:.43,stroke:'#806d55','stroke-width':.012,'stroke-dasharray':'.05 .035'})));
    fineRoads.forEach((r,i)=>town.append(E('path',{d:curveD(r),fill:'none',stroke:'#695642','stroke-width':i?.105:.15,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.35}),E('path',{d:curveD(r),fill:'none',stroke:'#d8c597','stroke-width':i?.072:.105,'stroke-linecap':'round','stroke-linejoin':'round'})));
    townLanes.forEach(r=>town.append(E('path',{d:curveD(r),fill:'none',stroke:'#77614a','stroke-width':.043,'stroke-linecap':'round',opacity:.36}),E('path',{d:curveD(r),fill:'none',stroke:'#cfb887','stroke-width':.025,'stroke-linecap':'round',opacity:.9})));
    t.roads.forEach((r,i)=>town.append(E('path',{d:curveD(r),fill:'none',stroke:'#5c4938','stroke-width':i<2?.18:.135,'stroke-linecap':'round','stroke-linejoin':'round',opacity:.42}),E('path',{d:curveD(r),fill:'none',stroke:'#ede0b9','stroke-width':i<2?.125:.086,'stroke-linecap':'round','stroke-linejoin':'round'})));
    const buildings=E('g',{'clip-path':'url(#graystoneTownClip)',class:'town-buildings'});
    buildingCache.forEach((b,i)=>{const tr=`rotate(${b.rot} ${b.x} ${b.y})`;if(sc>=4200)buildings.append(E('rect',{x:b.x-b.w/2+.009,y:b.y-b.h/2+.010,width:b.w,height:b.h,rx:.003,fill:'#342e29',opacity:.26,transform:tr}));buildings.append(E('rect',{x:b.x-b.w/2,y:b.y-b.h/2,width:b.w,height:b.h,rx:.003,fill:b.fill,stroke:'#41382f','stroke-width':.006,transform:tr}));if(sc>=6900&&b.ridge)buildings.append(E('path',{d:`M${b.x-b.w*.38} ${b.y}L${b.x+b.w*.38} ${b.y}`,stroke:i%3?'#d6b98a':'#544437','stroke-width':.004,transform:tr,opacity:.82}));if(sc>=15000&&i%4===0)buildings.append(E('circle',{cx:b.x+b.w*.22,cy:b.y-b.h*.18,r:.0035,fill:'#3c332c',transform:tr}))});town.append(buildings);
    if(sc>=6200){const yards=E('g',{class:'town-yards'});yardCache.forEach(y=>{if(y.kind==='tree')yards.append(E('circle',{cx:y.x+.006,cy:y.y+.007,r:y.s,fill:'#344638',opacity:.25}),E('circle',{cx:y.x,cy:y.y,r:y.s,fill:'#5f7654',stroke:'#405440','stroke-width':.003}));else if(y.kind==='well')yards.append(E('circle',{cx:y.x,cy:y.y,r:y.s*.72,fill:'#7d7060',stroke:'#3f3933','stroke-width':.004}),E('circle',{cx:y.x,cy:y.y,r:y.s*.34,fill:'#52717a'}));else yards.append(E('rect',{x:y.x-y.s,y:y.y-y.s*.55,width:y.s*2,height:y.s*1.1,rx:.003,fill:'#9b875f',stroke:'#62533f','stroke-width':.003,opacity:.78}))});town.append(yards)}
    const market=E('g',{class:'market-stalls'});for(let row=0;row<4;row++)for(let col=0;col<7;col++){const x=19879.93+col*.045,y=12909.90+row*.043,c=(row+col)%3;market.append(E('rect',{x,y,width:.032,height:.024,rx:.002,fill:['#9b4f3c','#756a43','#476b67'][c],stroke:'#493b31','stroke-width':.003}))}town.append(market);
    town.append(E('path',{d:wallD,fill:'none',stroke:'#352e29','stroke-width':.15,'stroke-linejoin':'round',opacity:.38}),E('path',{d:wallD,fill:'none',stroke:'#695b4d','stroke-width':.105,'stroke-linejoin':'round'}),E('path',{d:wallD,fill:'none',stroke:'#8d7b66','stroke-width':.072,'stroke-linejoin':'round','stroke-dasharray':'.10 .018'}),E('path',{d:wallD,fill:'none',stroke:'#b4a184','stroke-width':.016,'stroke-linejoin':'round',opacity:.82}));
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
