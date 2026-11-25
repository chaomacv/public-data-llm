const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {eventGroups, eventView, autoplayStep, loopOrder} = require('../showcase/gallery.js');
const data = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../showcase/assets/gallery-data.json'), 'utf8'));
const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);

test('token comparison reconciles both routing inputs against a uniform all-record baseline',()=>{
 const {tokenComparison}=require('../showcase/gallery.js'),t=require('../showcase/assets/token-comparison.json');
 const p=tokenComparison(t);
 assert.equal(p.cards,6877720);assert.equal(p.hybrid,p.cards+p.semantic);
 assert.equal(p.semantic,t.input_tokens.row_llm+t.input_tokens.review);
 assert.equal(p.baseline,Object.values(t.input_tokens).reduce((a,b)=>a+b,0));
 assert.equal(Object.values(t.records).reduce((a,b)=>a+b,0),14812812);
 assert.equal(t.units.map+t.units.entity_only,1755);assert.equal(t.units.row_llm+t.units.review,857);
 assert.equal(p.ratio,t.input_ratio);assert.equal(p.reduction,t.input_reduction);
 assert.equal(t.quality_excluded,1048465);
 assert.ok(!/"cells"|"file_id"|"scope_id"|"path"|\/opt\//.test(JSON.stringify(t)));
 assert.throws(()=>tokenComparison({...t,hybrid_input_tokens:p.hybrid+1}));
 assert.throws(()=>tokenComparison({...t,all_record_input_tokens:0}));
 const html=fs.readFileSync(require('node:path').join(__dirname,'../showcase/index.html'),'utf8');
 const card=html.split('data-card-key="dedup"')[1].split('data-card-key="network"')[0];
 assert.match(card,/1,347＋408/);assert.match(card,/382＋475/);
 assert.ok(!/97\.35%|逐条语义处理范围减少/.test(card));
 assert.ok(!html.includes('id="dedup-reuse-percent"'));
});

test('gallery aggregates reconcile separately within the completed full corpus', () => {
  assert.equal(data.kind, 'aggregate_notebook_gallery');
  assert.equal(data.final_pipeline_complete, true);
  assert.equal(data.subset.partial_only, false);
  assert.equal(data.subset.semantic_accuracy_evaluated, false);
  assert.equal(sum(data.formats, 'files'), data.corpus.logical_files);
  assert.equal(sum(data.file_space.bins, 'files'), data.corpus.logical_files);
  assert.equal(sum(data.events, 'count'), data.subset.events);
  assert.equal(sum(data.record_statuses, 'count'), data.subset.records);
  assert.equal(sum(data.identities, 'count'), data.subset.profiles);
  assert.equal(data.dedup.source_records, data.dedup.representative_records + data.dedup.exact_duplicate_source_records);
  assert.ok(data.subset.events < data.subset.records);
});
test('public gallery exports counts and observed times without private identifiers or records', () => {
  assert.deepEqual(Object.keys(data).sort(), ['schema_version','kind','generated_at','source_commit','final_pipeline_complete','corpus','subset','formats','file_space','events','taxonomy','record_statuses','identities','matching','dedup','progress','quality_correction'].sort());
  assert.ok(!/\/opt\/|password|api_key|"cells"|"record_id"|"file_id"|"path"|10\.126\./i.test(JSON.stringify(data)));
  for (const bin of data.file_space.bins) {
    assert.deepEqual(Object.keys(bin).sort(), ['format','status','bucket','files'].sort());
    assert.ok(Number.isSafeInteger(bin.files) && bin.files > 0);
    assert.ok(bin.bucket >= 0 && bin.bucket < data.file_space.buckets.length);
  }
});
test('all eighteen event categories reconcile without summing nonadditive profile counts',()=>{
  const selected=eventView(data);
  assert.equal(sum(selected,'count'),5968620);
  assert.equal(selected.length,18);
  assert.equal(data.taxonomy.total_events,5968620);
  assert.equal(data.taxonomy.category_count,18);
  assert.ok(!('legacy_qualification_events' in data.taxonomy));
  assert.ok(!('refined_types' in data.taxonomy));
  const classified=require('../showcase/assets/event-classification.json');
  assert.equal(classified.total_events,sum(selected,'count'));
  assert.equal(classified.category_count,selected.length);
  assert.equal(sum(classified.category_status,'observed_events'),classified.total_events);
  assert.ok(!('legacy_qualification_events' in classified));
  assert.ok(!data.events.some(r=>r.type==='qualification'));
  assert.equal(data.taxonomy.unique_licences,null);
  assert.equal(data.taxonomy.unique_registered_enterprises,null);
  const profiles=eventView(data,'all','profiles');
  for(const row of profiles)assert.equal(row.count,data.taxonomy.category_profiles.find(p=>p.type===row.type).count);
  const original=data.events.map(r=>({...r}));
  const multi={...data,events:[
    {type:'business_permit',label:'企业经营许可',status:'confirmed',count:7,associated_profiles:3},
    {type:'business_permit',label:'企业经营许可',status:'unknown',count:9,associated_profiles:4}],
    taxonomy:{...data.taxonomy,category_profiles:[{type:'business_permit',count:5}]}};
  assert.equal(eventView(multi,'all','profiles')[0].count,5);
  assert.equal(eventView(multi,'unknown','profiles')[0].count,4);
  assert.deepEqual(data.events,original);
});
test('event-stage filters preserve categories and never mix record counts into event totals', () => {
  const all = eventGroups(data.events);
  assert.equal(sum(all,'count'), data.subset.events);
  let total = 0;
  for (const state of new Set(data.events.map(r=>r.status))) {
    const selected = eventGroups(data.events,state);
    assert.equal(selected.length, all.length);
    assert.ok(selected.every(r=>r.count >= 0));
    total += sum(selected,'count');
  }
  assert.equal(total,data.subset.events);
  assert.equal(sum(eventGroups(data.events,'removed'),'count'),0);
});
test('reading pauses the carousel clock and resuming preserves elapsed time', () => {
  assert.deepEqual(autoplayStep(7900,200,8000,true),{advance:false,elapsed:7900});
  assert.deepEqual(autoplayStep(7900,200,8000,false),{advance:true,elapsed:100});
  assert.deepEqual(autoplayStep(2000,500,8000,false),{advance:false,elapsed:2500});
  assert.throws(()=>autoplayStep(0,1,0,false),RangeError);
});
test('execution timeline uses ordered actual observations, not fabricated uniform intervals', () => {
  const points=data.progress.points;
  assert.equal(data.progress.series_kind,'observed_processing_snapshots_not_business_events');
  const intervals=[];
  for(let i=1;i<points.length;i++) {
    intervals.push(Date.parse(points[i].at)-Date.parse(points[i-1].at));
    assert.ok(intervals.at(-1)>0);
    assert.ok(points[i].completed>=points[i-1].completed && points[i].completed<=data.progress.total);
  }
  assert.ok(new Set(intervals).size>1);
});
test('gallery mount targets exist and all nine slides have accessible navigation controls', () => {
  const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../showcase/index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../showcase/gallery.js'),'utf8');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const match of js.matchAll(/\$\('([a-z0-9-]+)'\)/g)) assert.ok(ids.has(match[1]),match[1]);
  assert.equal([...html.matchAll(/data-notebook="\d+"/g)].length,9);
  assert.equal([...html.matchAll(/data-gallery-page="\d+"/g)].length,9);
  assert.match(html,/src="gallery\.js(?:\?[^"\s]*)?"/);
  assert.ok(html.includes('aria-roledescription="轮播"'));
});
test('circular recentering keeps both neighbors at every wrap without cloning cards',()=>{
  for(const direction of [-1,1]){
    let order=[0,1,2,3,4,5,6],center=1;
    for(let i=0;i<35;i++){
      order=loopOrder(order,center).order;
      assert.equal(order[3],center);
      assert.equal(order[2],(center+6)%7);
      assert.equal(order[4],(center+1)%7);
      assert.deepEqual([...order].sort(),[0,1,2,3,4,5,6]);
      center=(center+direction+7)%7;
    }
  }
  assert.throws(()=>loopOrder([0,0,1],0),RangeError);
});


test('catalog totals, small categories and sampled links retain the true fixed input',()=>{
 const overview=require('../showcase/assets/source-overview.json');
 const {validate}=require('../showcase/source-overview.js');
 assert.equal(validate(overview),overview);
 assert.equal(overview.dataset_count,4710);
 assert.equal(overview.themes.reduce((n,t)=>n+t.count,0),4710);
 assert.equal(overview.themes.reduce((n,t)=>n+t.samples.length,0),192);
 assert.equal(overview.themes.find(t=>t.name==='生活安全').count,58);
 assert.equal(overview.themes.find(t=>t.name==='农业农村').count,103);
 assert.equal(overview.themes.find(t=>t.name==='消费购物').samples.length,5);
 assert.equal(overview.batch.known_logical_records,data.corpus.known_logical_records);
 assert.ok(overview.examples.every(e=>e.illustrative===true));
 const broken=structuredClone(overview);broken.themes[0].samples[0].url+='?token=example';assert.throws(()=>validate(broken));
});

test('the first six notebooks follow the requested narrative and remaining ones retain order',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../showcase/index.html'),'utf8');
 const keys=[...html.matchAll(/data-card-key="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(keys,['sources','acquisition','events','hierarchy','methods','dedup','network','portrait','timeline']);
 const labels=[...html.matchAll(/class="cell-number">\[(\d+)\]/g)].map(m=>m[1]);
 assert.deepEqual(labels,Array.from({length:9},(_,i)=>String(i+1).padStart(2,'0')));
 assert.ok(!html.includes('id="gallery-sunburst"')); 
});


test('lineage conserves every routing branch and matches its exact source exports',()=>{
 const path=require('node:path'),crypto=require('node:crypto');
 const lineage=require('../showcase/assets/data-lineage.json'),model=require('../showcase/lineage.js');
 assert.equal(model.validate(lineage),lineage);
 assert.equal(lineage.hash_basis,'utf8_lf_newlines');
 for(const [name,digest] of Object.entries(lineage.source_sha256))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../showcase/assets',name),'utf8').replace(/\r\n/g,'\n')).digest('hex'),digest);
 const final=require('../showcase/assets/final-results.json');
 assert.equal(lineage.counts.known,final.input.known_logical_records);
 assert.equal(lineage.counts.retained,final.counts.record_ledger);
 assert.equal(lineage.counts.mapped,final.preparation.field_mapped_records);
 assert.equal(lineage.stages.length,9);
 assert.deepEqual(lineage.flow_points.map(p=>p.count),[43653625,14812812,5968620]);
 assert.equal(lineage.outcomes.REVIEW,6179034);
 assert.ok(!/password|10\.126\.|\/opt\/|"cells"|"record_id"/.test(JSON.stringify(lineage)));
});

test('stage order and actual inference time remain distinct while both chart scales preserve quantities',()=>{
 const d=require('../showcase/assets/data-lineage.json'),m=require('../showcase/lineage.js');
 assert.ok(m.series(d,'flow').every(p=>p.at===undefined));
 assert.deepEqual(m.series(d,'time').map(p=>p.count),d.progress.points.map(p=>p.completed));
 for(const log of [true,false]){
  const p=m.positions(d,'flow',log).points;assert.equal(p[2].count,5968620);assert.equal(p[1].count,14812812);
  assert.ok(p[2].y>p[1].y);assert.ok(p[0].y<p[1].y);assert.ok(p.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
 }
 const p=m.positions(d,'time',false).points;
 assert.ok(p[1].x-p[0].x < p[6].x-p[5].x);
 assert.equal(p.at(-1).count,388349);
 const ticks=m.timeTickIndices(p);
 assert.equal(ticks[0],0);assert.equal(ticks.at(-1),p.length-1);
 const span=p.at(-1).x-p[0].x;
 assert.ok(p[ticks[1]].x-p[0].x>span*.25&&p.at(-1).x-p[ticks[1]].x>span*.25);
});

test('inconsistent lineage counts or fabricated stage timestamps cannot be presented as the batch',()=>{
 const d=require('../showcase/assets/data-lineage.json'),m=require('../showcase/lineage.js');
 for(const change of [c=>c.counts.retained++,c=>c.outcomes.REVIEW++,c=>c.flow_points[0].at='2026-11-07T00:00:00Z',c=>c.progress.points[1].at=c.progress.points[0].at]){
  const copy=structuredClone(d);change(copy);assert.throws(()=>m.validate(copy));
 }
 assert.throws(()=>m.series(d,'unknown'));
});

test('screening reconciles units kept or deferred with one field plan per continuing unit',()=>{
 const d=require('../showcase/assets/run-summary.json'),m=require('../showcase/run-visual.js');
 assert.equal(m.validateScreening(d),d.screening);
 assert.equal(d.screening.total_units-d.screening.excluded_units,d.plans.total);
 assert.equal(Object.entries(d.plans).filter(([k])=>k!=='total').reduce((n,[,v])=>n+v,0),d.plans.total);
 for(const mutate of [x=>x.screening.excluded_units++,x=>x.screening.review_units--,x=>x.plans.total++]){
  const copy=structuredClone(d);mutate(copy);assert.throws(()=>m.validateScreening(copy));
 }
 assert.match(m.render(2,d),/13,281/);assert.match(m.render(2,d),/10,669/);assert.match(m.render(2,d),/2,612/);
 assert.deepEqual(m.screeningView(d),{total_units:13281,excluded_units:10669,continuing_units:2612,actionable_units:2137,review_units:475});
 assert.equal(d.plans.total,9551);assert.equal(d.screening.excluded_units,3730);
 assert.ok(!/3,730|9,551/.test(m.render(2,d)));
 const lineage=require('../showcase/assets/data-lineage.json');
 assert.match(lineage.stages[2].output,/10,669/);assert.match(lineage.stages[2].output,/2,612/);
 assert.match(lineage.stages[3].output,/2,612/);assert.ok(!/6,939|9,551/.test(lineage.stages[3].output));
});

test('first four stage illustrations distinguish source files, reading inputs and synthetic file cards',()=>{
 const m=require('../showcase/run-visual.js'),d=require('../showcase/assets/run-summary.json');
 assert.match(m.render(0,d),/CSV/);assert.match(m.render(0,d),/DOCX/);assert.match(m.render(0,d),/PDF/);assert.match(m.render(0,d),/RAR/);
 const diagram=m.render(1,d);assert.equal((diagram.match(/is-read/g)||[]).length,3);
 for(const name of ['A.csv','B.zip','C.xlsx','D.jpg','E.jsonl'])assert.ok(diagram.includes(name));
 const card=m.renderDetail(2,d);assert.match(card,/结构示例/);assert.match(card,/scope_id/);assert.match(card,/随机5/);
 const examples=m.render(3,d);assert.equal((examples.match(/data-plan-mode=/g)||[]).length,4);
 for(const label of ['程序提取','仅主体信息','模型逐条理解','待复核','1,347','408','382','475'])assert.ok(examples.includes(label));
 assert.match(examples,/甲公司拟获支持/);assert.match(examples,/企业？项目？/);assert.ok(!examples.includes('run-screen-track'));
 for(let i=0;i<9;i++)if(i!==2&&i!==4)assert.equal(m.renderDetail(i,d),'');
 const semantic=m.render(5,d);assert.equal((semantic.match(/<li>/g)||[]).length,5);
 for(const step of ['组织输入','精确去重','本地模型提取','程序核验','逐来源回填'])assert.ok(semantic.includes(step));
 assert.ok(semantic.includes('不确定项进入复核'));
 assert.equal(m.render(9,d),'');
});


test('full-reading diagram derives units and both record routes without treating review as extracted facts',()=>{
 const m=require('../showcase/run-visual.js'),d=require('../showcase/assets/run-summary.json');
 assert.deepEqual(m.readingFlow(d),{units:2612,total:14812812,field:14420658,semantic:392154});
 const graph=m.render(4,d);for(const value of ['2,612','14,812,812','14,420,658','392,154','含待复核'])assert.ok(graph.includes(value));
 assert.equal((graph.match(/class="run-record-branch"/g)||[]).length,2);
 const bad=structuredClone(d);bad.preparation.field_mapped_records++;assert.throws(()=>m.readingFlow(bad));
});

test('quality exclusions reconcile independently and do not rewrite historical execution observations',()=>{
 const c=require('../showcase/assets/quality-correction.json'),f=require('../showcase/assets/final-results.json');
 const l=require('../showcase/assets/data-lineage.json');
 assert.equal(c.quality_excluded_records,1048465);
 assert.equal(c.known_records,c.relevance_excluded_records+c.quality_excluded_records+c.record_ledger);
 assert.equal(c.record_ledger,c.field_mapped_records+c.semantic_source_records);
 assert.equal(c.semantic_source_records,c.representative_records+c.exact_duplicate_source_records);
 assert.equal(c.record_statuses.NO_EVENT,2332837);
 assert.equal(c.subject_and_event_sources_affected,0);
 assert.equal(c.duplicate_ratio_percent,3806/392154*100);
 assert.equal(data.progress.total,c.historical_execution.representative_records);
 assert.equal(data.progress.scope,'historical_execution_before_quality_correction');
 assert.equal(f.counts.record_ledger,c.record_ledger);
 assert.equal(l.counts.quality,c.quality_excluded_records);
 assert.equal(l.progress.points.at(-1).completed,388349);
 assert.match(l.stages[4].output,/1,048,465/);
 assert.match(l.stages[8].output,/1,048,465/);
 assert.ok(!/\/opt\/|"record_id"|"file_id"|"cells"/.test(JSON.stringify(c)));
});


test('identity, export and acceptance diagrams use reconciled result counts and preserve review scope',()=>{
 const m=require('../showcase/run-visual.js'),d=require('../showcase/assets/run-summary.json'),l=require('../showcase/assets/data-lineage.json');
 const c=m.resultCounts(d),f=m.auditFlow(d,l.outcomes);
 assert.equal(c,d.final_counts);
 assert.deepEqual(f,{total:43653625,excluded:27792348,quality:1048465,processed:14812812,review:6179034});
 assert.equal(f.total,f.excluded+f.quality+f.processed);
 assert.equal(Object.values(l.outcomes).reduce((a,b)=>a+b,0),f.processed);
 const identity=m.render(6,d,l.outcomes);
 for(const text of ['8,800,229','5,202,714','标识一致 · 无冲突','保留独立身份／复核','临时身份'])assert.ok(identity.includes(text));
 const exports=m.render(7,d,l.outcomes);assert.equal((exports.match(/class="run-export-file"/g)||[]).length,4);
 for(const count of ['14,812,812','5,202,714','5,968,620','6,331,400'])assert.ok(exports.includes(count));
 const audit=m.render(8,d,l.outcomes);
 for(const count of ['27,792,348','1,048,465','14,812,812','43,653,625','6,179,034'])assert.ok(audit.includes(count));
 assert.ok(audit.includes('已包含在台账中'));assert.ok(audit.includes('语义准确率另行评测'));
 assert.equal((audit.match(/data-passed="true"/g)||[]).length,3);
 const {translate}=require('../showcase/i18n.js');
 for(const index of [6,7,8]){
  const text=m.render(index,d,l.outcomes).replace(/<[^>]*>/g,'\n').split('\n').map(s=>translate(s.trim())).join(' ');
  assert.ok(!/[\u3400-\u9fff]/.test(text));
 }
 const bad=structuredClone(d);bad.preparation.quality_excluded_records++;assert.throws(()=>m.auditFlow(bad,l.outcomes));
 assert.throws(()=>m.auditFlow(d,{...l.outcomes,REVIEW:l.outcomes.REVIEW+1}));
 const badResult=structuredClone(d);badResult.final_counts.record_ledger++;assert.throws(()=>m.resultCounts(badResult));
 const unverified=structuredClone(d);unverified.validation.exports_round_trip_validated=false;
 assert.equal((m.render(8,unverified,l.outcomes).match(/data-passed="true"/g)||[]).length,2);
});


test('review calculator states explicit assumptions and the flow only decreases on one branch',()=>{
 const r=require('../showcase/review.js'),m=require('../showcase/lineage.js'),d=require('../showcase/assets/data-lineage.json');
 assert.ok(Math.abs(r.detectionProbability(150,.02)-(1-.98**150))<1e-12);
 assert.equal((r.detectionProbability(150,.02)*100).toFixed(1),'95.2');
 assert.equal(r.detectionProbability(150,0),0);assert.equal(r.detectionProbability(150,1),1);
 assert.ok(r.detectionProbability(300,.02)>r.detectionProbability(150,.02));
 for(const args of [[0,.02],[10,-.1],[10,1.1],[1.5,.02]])assert.throws(()=>r.detectionProbability(...args));
 assert.equal(r.nextTab(3,'ArrowRight'),0);assert.equal(r.nextTab(0,'ArrowLeft'),3);assert.equal(r.nextTab(1,'End'),3);
 assert.ok(d.flow_points.every((p,i)=>!i||p.count<=d.flow_points[i-1].count));
 const bad=structuredClone(d);bad.flow_points.reverse();assert.throws(()=>m.validate(bad));
 const run=require('../showcase/run-visual.js'),snapshot=require('../showcase/assets/run-summary.json');
 const examples=run.renderDetail(4,snapshot);assert.equal((examples.match(/class="run-route-example"/g)||[]).length,4);
 assert.match(examples,/合成示意/);assert.match(examples,/本次检查未发现违法行为/);
 const html=fs.readFileSync(require('node:path').join(__dirname,'../showcase/index.html'),'utf8');
 assert.ok(html.indexOf('id="review-mechanism"')>html.indexOf('id="pipeline"'));
 assert.ok(html.indexOf('id="review-mechanism"')<html.indexOf('id="field-notes"'));
 for(const key of ['抽查参数配置与检出概率计算','新随机样本复验','最多两轮','不是NIST规定','pmc232.htm','NIST.AI.600-1.pdf'])assert.ok(html.includes(key));
});

test('review-unit routing update is pending and never rewrites historical result counts',()=>{
 const update=require('../showcase/assets/routing-update.json'),snapshot=require('../showcase/assets/run-summary.json');
 assert.equal(update.status,'not_executed');assert.equal(update.historical_results_unchanged,true);
 assert.equal(update.affected_processing_units,snapshot.plans.review);
 assert.equal(update.historical_semantic_units,snapshot.plans.row_llm);
 assert.equal(update.planned_semantic_units,update.affected_processing_units+update.historical_semantic_units);
 assert.equal(update.planned_semantic_units,857);
 const m=require('../showcase/run-visual.js'),html=m.render(3,snapshot);
 assert.match(html,/原待复核 → 复杂语义/);assert.match(html,/已实现/);
 assert.equal(snapshot.preparation.pending_semantic_source_records,392154);
 assert.equal(snapshot.final_counts.events,5968620);
 assert.ok(!/"cells"|"file_id"|"scope_id"|\/opt\//.test(JSON.stringify(update)));
});


test('award rules enforce a numeric amount and the exact three-state domain',()=>{
 const {validateAward}=require('../showcase/review.js');
 assert.deepEqual(validateAward({amount:'120',status:'已中标'}),{errors:[],action:'confirmed'});
 assert.equal(validateAward({amount:'80.5',status:'拟中标'}).action,'proposed');
 assert.deepEqual(validateAward({amount:'',status:'未中标'}),{errors:[],action:'no_event'});
 for(const amount of ['待定','约120','120万元','1e3','Infinity','-1']){
  const result=validateAward({amount,status:'已中标'});assert.equal(result.action,'complex_semantic');
  assert.equal(result.errors[0].code,'AMOUNT_NOT_DECIMAL');assert.equal(result.errors[0].value,amount);
 }
 for(const status of ['中标候选','已中标？',' 已中标','已中标 ','']){
  const result=validateAward({amount:'120',status});assert.equal(result.errors[0].code,'ENUM_NOT_ALLOWED');
  assert.equal(result.action,'complex_semantic');assert.equal(result.errors[0].rule,'STATUS_ENUM_V1');
 }
 assert.equal(validateAward({amount:'',status:'拟中标'}).errors[0].code,'AMOUNT_REQUIRED');
 assert.equal(validateAward({amount:'0',status:'已中标'}).errors.length,0);
});
