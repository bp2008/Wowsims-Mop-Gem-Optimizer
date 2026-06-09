// Extracts the <script> blocks from GemOptimizer.html and exercises the solver.
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'GemOptimizer.html'),'utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const module2={exports:{}};
new Function('module',scripts)(module2);
const {solve,computeReqs,parseGearExport,buildImportGroups,resolveGem,GEM_BY_ID,GEM_ALL_BY_ID,ITEM_BY_ID,gemFits}=module2.exports;
const G=id=>GEM_BY_ID.get(id);
let fails=0;
function check(name,cond){console.log((cond?'PASS':'FAIL')+'  '+name);if(!cond)fails++;}
function planFitsConstraints(res){
  return res.rows.every(r=>{
    if(r.lock)return true;
    const p=res.plan.get(r);
    return r.req==='any'||(p.gem&&gemFits(p.gem,r.req));
  });
}
function meetsTargets(res){
  return res.supp.every(k=>(res.finalTot[k]||0)>=res.adjT[k]);
}

// T1: legacy behavior — all sockets 'any', example case: 1 swap (cross-keeping)
{
  const rows=[
    {cur:G(76692),des:G(76692),lock:false,sc:'any'},
    {cur:G(76666),des:G(76658),lock:false,sc:'any'},
    {cur:G(76658),des:G(76666),lock:false,sc:'any'},
    {cur:G(76697),des:G(76699),lock:false,sc:'any'},
    {cur:G(76699),des:G(76697),lock:false,sc:'any'},
    {cur:G(76700),des:G(76699),lock:false,sc:'any'},
  ];
  const res=solve(rows,false,0);
  check('T1 legacy example: 1 swap',res.swaps===1);
  check('T1 meets targets',meetsTargets(res));
}

// T2: same example with socket colors set (all matched by both cur and des) — still 1 swap
{
  const rows=[
    {cur:G(76692),des:G(76692),lock:false,sc:'red'},
    {cur:G(76666),des:G(76658),lock:false,sc:'red'},
    {cur:G(76658),des:G(76666),lock:false,sc:'yellow'},
    {cur:G(76697),des:G(76699),lock:false,sc:'yellow'},
    {cur:G(76699),des:G(76697),lock:false,sc:'any'},
    {cur:G(76700),des:G(76699),lock:false,sc:'yellow'},
  ];
  const res=solve(rows,false,0);
  check('T2 colored example: 1 swap',res.swaps===1);
  check('T2 constraints honored',planFitsConstraints(res));
  check('T2 meets targets',meetsTargets(res));
}

// T3: constraint forces extra swaps.
// A: blue socket, cur=Smooth (yellow crit320), des=Solid (blue sta240)
// B: any socket,  cur=Solid (blue sta240),   des=Smooth (yellow crit320)
// Unconstrained optimum = 0 swaps (cross-keep). Blue constraint on A forbids keeping
// the yellow gem there -> no 0/1-swap plan reaches crit320+sta240 -> 2 swaps.
{
  const rowsAny=[
    {cur:G(76697),des:G(76639),lock:false,sc:'any'},
    {cur:G(76639),des:G(76697),lock:false,sc:'any'},
  ];
  const r0=solve(rowsAny,false,0);
  check('T3a unconstrained: 0 swaps',r0.swaps===0);
  const rowsCol=[
    {cur:G(76697),des:G(76639),lock:false,sc:'blue'},
    {cur:G(76639),des:G(76697),lock:false,sc:'any'},
  ];
  const r1=solve(rowsCol,false,0);
  check('T3b blue constraint: 2 swaps',r1.swaps===2);
  check('T3b constraints honored',planFitsConstraints(r1));
  check('T3b meets targets',meetsTargets(r1));
  const gA=r1.plan.get(r1.rows[0]).gem;
  check('T3b slot A gem fits blue',gemFits(gA,'blue'));
}

// T4: constrained socket where WowSims gem does NOT match socket color -> no constraint, free rearrangement
{
  const rows=[
    {cur:G(76697),des:G(76639),lock:false,sc:'red'}, // des Solid is blue, doesn't fit red -> unconstrained
    {cur:G(76639),des:G(76697),lock:false,sc:'any'},
  ];
  const res=solve(rows,false,0);
  check('T4 mismatched des: 0 swaps',res.swaps===0);
}

// T5: replacement must match color even when rearranging.
// Two yellow sockets, WowSims wants Quick+Smooth (both yellow). Currently: Quick in slot1, Fractured in slot2.
// Optimal: keep Quick, swap Fractured -> Smooth (yellow). Check assigned replacement fits.
{
  const rows=[
    {cur:G(76699),des:G(76699),lock:false,sc:'yellow'},
    {cur:G(76700),des:G(76697),lock:false,sc:'yellow'},
  ];
  const res=solve(rows,false,0);
  check('T5 one swap',res.swaps===1);
  check('T5 constraints honored',planFitsConstraints(res));
  check('T5 meets targets',meetsTargets(res));
}

// T6: lock overrides constraint (locked rows always keep)
{
  const rows=[
    {cur:G(76697),des:G(76639),lock:true,sc:'blue'},
    {cur:G(76639),des:G(76697),lock:false,sc:'any'},
  ];
  const res=solve(rows,false,0);
  const pA=res.plan.get(res.rows[0]);
  check('T6 locked kept',pA.action==='keep'&&pA.gem.id===76697);
}

// T7: JC gems still capped at 2 with constraints active
{
  const rows=[
    {cur:null,des:G(83151),lock:false,sc:'red'},   // Delicate Serpent's Eye agi320
    {cur:null,des:G(83151),lock:false,sc:'red'},
    {cur:null,des:G(76692),lock:false,sc:'red'},   // Delicate Primordial Ruby agi160
  ];
  const res=solve(rows,true,0);
  check('T7 jc cap',res.jcFinal<=2);
  check('T7 constraints honored',planFitsConstraints(res));
  check('T7 meets targets',meetsTargets(res));
}

// T8: orange gem can satisfy either red or yellow socket — solver must pick assignments that work.
// red socket needs str-ish, yellow needs crit-ish; WowSims wants Inscribed (orange str/crit) in both.
{
  const rows=[
    {cur:G(76661),des:G(76661),lock:false,sc:'red'},
    {cur:G(76700),des:G(76661),lock:false,sc:'yellow'}, // cur Fractured (yellow mastery) wrong stats
  ];
  const res=solve(rows,false,0);
  check('T8 one swap',res.swaps===1);
  check('T8 constraints honored',planFitsConstraints(res));
  check('T8 meets targets',meetsTargets(res));
}

// T9: rows without sc field (old saved state / module callers) behave as 'any'
{
  const rows=[
    {cur:G(76697),des:G(76639),lock:false},
    {cur:G(76639),des:G(76697),lock:false},
  ];
  const res=solve(rows,false,0);
  check('T9 missing sc treated as any: 0 swaps',res.swaps===0);
}

// T10: item-aware relaxation — WowSims broke the bonus on one socket of the item,
// so the sibling socket is unconstrained too and free cross-keeping gives 0 swaps.
{
  const grp={label:'2x blue item',imp:1,bonus:{stat:'hit',amt:120}};
  const rows=[
    {cur:G(76697),des:G(76639),lock:false,sc:'blue',grp}, // des Solid fits blue
    {cur:G(76639),des:G(76697),lock:false,sc:'blue',grp}, // des Smooth (yellow) breaks the bonus
  ];
  const res=solve(rows,false,0);
  check('T10 broken-by-WowSims bonus relaxes whole item: 0 swaps',res.swaps===0);
  check('T10 bonusState=wowsims',res.rows[0].bonusState==='wowsims');
}

// T11: same item but WowSims keeps the bonus -> constraint enforced on both sockets
{
  const grp={label:'2x blue item',imp:1,bonus:{stat:'hit',amt:120}};
  const rows=[
    {cur:G(76697),des:G(76639),lock:false,sc:'blue',grp}, // cur Smooth (yellow) must go
    {cur:G(76639),des:G(76652),lock:false,sc:'blue',grp}, // des Jagged (green) fits blue
  ];
  const res=solve(rows,false,0);
  check('T11 kept bonus: 1 swap',res.swaps===1);
  check('T11 bonusState=kept',res.rows[0].bonusState==='kept');
  const gA=res.plan.get(res.rows[0]).gem;
  check('T11 replacement fits blue',res.plan.get(res.rows[0]).action==='keep'||gemFits(gA,'blue'));
  check('T11 all constraints honored',planFitsConstraints(res));
  check('T11 meets targets',meetsTargets(res));
}

// T12: imported item known to have NO socket bonus -> never constrained
{
  const grp={label:'no-bonus item',imp:1,bonus:null};
  const rows=[
    {cur:G(76697),des:G(76639),lock:false,sc:'blue',grp},
    {cur:G(76639),des:G(76697),lock:false,sc:'any',grp},
  ];
  const res=solve(rows,false,0);
  check('T12 no bonus -> unconstrained: 0 swaps',res.swaps===0);
  check('T12 bonusState=nobonus',res.rows[0].bonusState==='nobonus');
}

// T13: lock that breaks a WowSims-kept bonus frees the sibling sockets
{
  const grp={label:'lock-broken item',imp:1,bonus:{stat:'hit',amt:120}};
  const rows=[
    {cur:G(76697),des:G(76639),lock:true,sc:'blue',grp},  // locked yellow gem in blue socket
    {cur:G(76639),des:G(76652),lock:false,sc:'blue',grp},
  ];
  computeReqs(rows);
  check('T13 bonusState=lock',rows[0].bonusState==='lock');
  check('T13 siblings unconstrained',rows[1].req==='any');
}

// T14: parseGearExport accepts sim Export>Json, addon export, and bare EquipmentSpec
{
  const simJson=JSON.stringify({player:{equipment:{items:[{id:101,enchant:1,gems:[76692,0]},{id:102,gems:[76697]}]}},encounter:{}});
  const a=parseGearExport(simJson);
  check('T14a sim json: 2 items',a.length===2&&a[0].id===101&&a[0].gems[0]===76692);
  const addonJson=JSON.stringify({version:'1.0',class:'warrior',gear:{items:[null,{id:103,gems:[null,76639]},{id:104}]}});
  const b=parseGearExport(addonJson);
  check('T14b addon json: 2 items, null gem -> 0',b.length===2&&b[0].id===103&&b[0].gems[0]===0&&b[0].gems[1]===76639);
  const bare=JSON.stringify({items:[{id:105,gems:[1,2]}]});
  check('T14c bare EquipmentSpec',parseGearExport(bare).length===1);
  let threw=false;try{parseGearExport('{"foo":1}');}catch(e){threw=true;}
  check('T14d rejects unknown shape',threw);
}

// T15: buildImportGroups against the embedded ITEM_DB
{
  const items=[...ITEM_BY_ID.values()];
  const it2=items.find(i=>i.sk.length===2&&i.sk[0]==='red'&&i.sk[1]==='yellow'&&i.bs);
  check('T15 found a red+yellow item in ITEM_DB',!!it2);
  if(it2){
    const des=[{id:it2.id,gems:[76692,76697]}];
    const cur=[{id:it2.id,gems:[76697,76692]}];
    const {groups}=buildImportGroups(cur,des);
    check('T15 one group',groups.length===1);
    const g=groups[0];
    check('T15 label has item name',g.label.includes(it2.n));
    check('T15 bonus carried',!!g.bonus&&g.bonus.stat===it2.bs&&g.bonus.amt===it2.bn);
    check('T15 socket colors red,yellow',g.sockets.length===2&&g.sockets[0].sc==='red'&&g.sockets[1].sc==='yellow');
    check('T15 cur/des wired',g.sockets[0].cur===76697&&g.sockets[0].des===76692);
  }
  const itMeta=items.find(i=>i.sk.length>1&&i.sk.includes('meta'));
  check('T15 found a meta-socket item',!!itMeta);
  if(itMeta){
    const gems=itMeta.sk.map(c=>c==='meta'?76879:76692);
    const {groups,notes}=buildImportGroups(null,[{id:itMeta.id,gems}]);
    const g=groups[0];
    check('T15 meta socket skipped',g.sockets.length===itMeta.sk.length-1);
    check('T15 meta note emitted',notes.some(n=>n.includes('meta')));
  }
  // belt buckle: one more gem than the item has sockets -> extra prismatic 'any' socket
  const it1=items.find(i=>i.sk.length===1&&(i.sk[0]==='red'||i.sk[0]==='yellow'||i.sk[0]==='blue'));
  if(it1){
    const {groups}=buildImportGroups(null,[{id:it1.id,gems:[76692,76639]}]);
    check('T15 buckle extra socket is any',groups[0].sockets.length===2&&groups[0].sockets[1].sc==='any');
  }
  // unknown current item -> treated as empty + note
  if(it2){
    const {groups,notes}=buildImportGroups([{id:999999,gems:[76639]}],[{id:it2.id,gems:[76692,76697]}]);
    check('T15 missing cur item -> empty sockets',groups[0].sockets.every(s=>!s.cur));
    check('T15 missing cur note',notes.some(n=>n.includes('not in your current gear')));
  }
}

// T16: end-to-end import -> solve with sha/meta gems resolved from GEM_DB
{
  const sha=[...GEM_ALL_BY_ID.values()].find(g=>!GEM_BY_ID.get(g.id)&&Object.keys(g.s).length);
  check('T16 GEM_DB has gems beyond curated list',!!sha);
  if(sha){
    const r=resolveGem(sha.id);
    check('T16 resolveGem falls back to GEM_DB',r&&r.n===sha.n&&r.ext===1);
    // a des gem outside the curated list still solves (it is its own candidate)
    const rows=[{cur:null,des:r,lock:false,sc:'any'}];
    const res=solve(rows,false,0);
    check('T16 solve with external des gem',res.swaps===1&&meetsTargets(res));
  }
}

process.exit(fails?1:0);
