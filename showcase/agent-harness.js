/* Executable, offline harness illustration. Tool results and human receipts are synthetic. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root.document)api.mount(root);
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const tools=[
  {name:'expand_file_card',label:'扩充文件卡片',gate:'CONTEXT',input:{additional:12,seed:43},guard:'从未入选记录中补样，保留已有样本与位置；剩余不足则全部加入。'},
  {name:'validate_records',label:'逐表约束与引用核验',gate:'GATE 01',input:{records_ref:'demo://synthetic-unit-A/r1/records',plan_ref:'demo://synthetic-unit-A/plan-v1'},guard:'按当前方案检查字段、类型、枚举与本行引用；异常记录问题，不自动猜值。'},
  {name:'reconcile_counts',label:'逐条数量对账',gate:'GATE 02',input:{ledger_ref:'demo://synthetic-unit-A/r1/ledger'},guard:'去向数量必须守恒，编号必须唯一；任一不符则阻止后续放行。'},
  {name:'review_with_model',label:'独立模型抽样复核',gate:'GATE 03',input:{sample_ref:'demo://synthetic-unit-A/card/v2',model_role:'independent'},guard:'规则与对账通过后才复核；问题绑定当前结果版本，触发整单元重做。'},
  {name:'redo_unit',label:'整单元重做',gate:'RECOVERY',input:{actor:'main'},guard:'主模型、独立模型各最多重做一次；新版本重新核验，旧回执不能继续使用。'},
  {name:'request_human_review',label:'人工审查与裁决',gate:'GATE 04',input:{task_ref:'demo://synthetic-unit-A/r1/human-review-task'},guard:'等待人工回执；独立模型重做后升级人工审查，证据不足则保持挂起。'},
  {name:'trace_evidence',label:'只读证据追溯',gate:'GATE 05',input:{event_ref:'demo://synthetic-unit-A/r1/event-1'},guard:'沿事件、来源记录、字段和原附件读取证据，不覆盖原始输入。'},
  {name:'release_unit',label:'受控放行',gate:'COMMIT',input:{},guard:'只接受当前版本的核验、对账、模型或升级审查、人工及证据回执。'}
 ];
 const phases={ready:'等待工具执行',checking:'核验进行中',needs_main_redo:'等待主模型整单元重做',needs_independent_redo:'等待独立模型整单元重做',held:'等待人工补充审查',blocked:'已阻止放行',released:'当前版本已放行'};
 const outcomes={ok:'通过',fail:'发现问题',hold:'挂起',blocked:'拦截'};
 const clone=x=>JSON.parse(JSON.stringify(x));
 function draw(remaining,n,seed){
  const picked=[];
  for(let i=0;i<n&&remaining.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;picked.push(remaining.splice(seed%remaining.length,1)[0]);}
  return picked;
 }
 function createUnit(){
  const all=Array.from({length:120},(_,i)=>'row-'+String(i+1).padStart(3,'0'));
  const selected=[0,1,2,58,59,60,117,118,119].map(i=>all[i]);
  selected.push(...draw(all.filter(id=>!selected.includes(id)),6,42));
  return {unit_id:'synthetic-unit-A',revision:1,input_signature:'synthetic-input-v1',plan_signature:'synthetic-plan-v1',total:120,card_version:1,selected,phase:'ready',
   retries:{main:0,independent:0},last_actor:null,checks:{rules:null,counts:null,model:null,human:null,evidence:null},cache:{},journal:[]};
 }
 function executeTool(original,call,observation){
  const state=clone(original),input=call.input||{};
  function result(status,code,output={}){
   const receipt={tool:call.tool,unit_id:state.unit_id,revision:state.revision,requested_revision:call.revision,input_signature:state.input_signature,plan_signature:state.plan_signature,card_version:state.card_version,call_id:call.call_id,status,code,output};
   state.journal.push(receipt);if(status==='blocked')state.phase='blocked';
   if(call.call_id)state.cache[call.call_id]={fingerprint:JSON.stringify(call),receipt};
   return {state,receipt};
  }
  if(call.unit_id!==state.unit_id||call.revision!==state.revision)return result('blocked','STALE_OR_FOREIGN_REVISION');
  if(call.input_signature!==state.input_signature||call.plan_signature!==state.plan_signature)return result('blocked','SIGNATURE_MISMATCH');
  if(typeof call.call_id!=='string'||!call.call_id)return result('blocked','CALL_ID_REQUIRED');
  const previous=state.cache[call.call_id];
  if(previous){
   if(previous.fingerprint===JSON.stringify(call))return {state:original,receipt:clone(previous.receipt),cached:true};
   // Preserve the first receipt for this ID when a different payload is rejected.
   const rejected=result('blocked','IDEMPOTENCY_CONFLICT');rejected.state.cache[call.call_id]=previous;return rejected;
  }
  const tool=tools.find(t=>t.name===call.tool);
  if(!tool)return result('blocked','UNKNOWN_TOOL');
  const allowed=Object.keys(tool.input);
  if(Object.keys(input).some(k=>!allowed.includes(k))||allowed.some(k=>!(k in input)))return result('blocked','INVALID_ARGUMENT');
  for(const [key,value] of Object.entries(input))if(key.endsWith('_ref')){
   if(typeof value!=='string'||!value.startsWith('demo://'+state.unit_id+'/'))return result('blocked','FOREIGN_ARTIFACT');
   if(['records_ref','ledger_ref','task_ref','event_ref'].includes(key)&&!value.startsWith('demo://'+state.unit_id+'/r'+state.revision+'/'))return result('blocked','STALE_ARTIFACT');
   if(key==='plan_ref'&&value!=='demo://'+state.unit_id+'/plan-v'+state.revision)return result('blocked','STALE_PLAN');
   if(key==='sample_ref'&&value!=='demo://'+state.unit_id+'/card/v'+state.card_version)return result('blocked','STALE_CARD');
  }
  // Adapter observations are separate from Agent arguments. No model can pass itself a positive check.
  if(!['expand_file_card','redo_unit','release_unit'].includes(call.tool)&&(!observation||observation.revision!==state.revision))return result('blocked','CURRENT_TOOL_RECEIPT_REQUIRED');
  const checked=()=>state.checks.rules===state.revision&&state.checks.counts===state.revision;
  switch(call.tool){
   case 'expand_file_card':{
    if(!Number.isSafeInteger(input.additional)||input.additional<0||input.additional>120||!Number.isSafeInteger(input.seed)||input.seed<0)return result('blocked','INVALID_ARGUMENT');
    const remaining=Array.from({length:state.total},(_,i)=>'row-'+String(i+1).padStart(3,'0')).filter(id=>!state.selected.includes(id));
    const added=draw(remaining,input.additional,input.seed);state.selected.push(...added);state.card_version++;
    return result('ok','CARD_EXPANDED',{added:added.length,card_total:state.selected.length,sample_ids:added,seed:input.seed});
   }
   case 'validate_records':
    if(!Number.isSafeInteger(observation.errors)||observation.errors<0)return result('blocked','INVALID_TOOL_RESULT');
    if(observation.errors){state.checks.rules=null;return result('blocked','RULE_OR_EVIDENCE_ERROR',{errors:observation.errors});}
    state.checks.rules=state.revision;state.phase='checking';return result('ok','RULES_VERIFIED');
   case 'reconcile_counts':
    if(['included','excluded','review','unique_ids'].some(k=>!Number.isSafeInteger(observation[k])||observation[k]<0))return result('blocked','INVALID_TOOL_RESULT');
    if(observation.included+observation.excluded+observation.review!==state.total||observation.unique_ids!==state.total){state.checks.counts=null;return result('blocked','ACCOUNTING_MISMATCH');}
    state.checks.counts=state.revision;return result('ok','COUNTS_RECONCILED',{total:state.total});
   case 'review_with_model':
    if(input.model_role!=='independent')return result('blocked','INVALID_ARGUMENT');
    if(!['pass','fail'].includes(observation.outcome))return result('blocked','INVALID_TOOL_RESULT');
    if(!checked())return result('blocked','CHECKS_REQUIRED');
    if(observation.outcome==='fail'){
     state.checks.model=null;state.checks.human=null;state.phase=state.retries.main?'needs_independent_redo':'needs_main_redo';
     return result('fail','MODEL_REVIEW_FAILED');
    }
    state.checks.model=state.revision;state.phase='checking';return result('ok','MODEL_REVIEW_PASSED');
   case 'redo_unit':{
    if(!['main','independent'].includes(input.actor))return result('blocked','INVALID_ARGUMENT');
    if(state.retries[input.actor]>=1)return result('blocked','RETRY_BUDGET_EXHAUSTED');
    const expected=input.actor==='main'?'needs_main_redo':'needs_independent_redo';
    if(state.phase!==expected)return result('blocked','REDO_NOT_AUTHORIZED');
    state.retries[input.actor]++;state.revision++;state.plan_signature='synthetic-plan-v'+state.revision;state.last_actor=input.actor;
    state.checks={rules:null,counts:null,model:null,human:null,evidence:null};state.phase='checking';
    return result('ok','UNIT_REBUILT',{actor:input.actor,new_revision:state.revision});
   }
   case 'request_human_review':
    if(!['pass','fail','insufficient'].includes(observation.decision))return result('blocked','INVALID_TOOL_RESULT');
    if(!checked()||state.checks.model!==state.revision&&state.last_actor!=='independent')return result('blocked','REVIEW_NOT_READY');
    // This is a browser fixture, never a real signed authorization.
    if(observation.receipt!=='synthetic-human-receipt')return result('blocked','HUMAN_RECEIPT_REQUIRED');
    if(observation.decision!=='pass'){state.checks.human=null;state.phase='held';return result('hold','HUMAN_REVIEW_PENDING');}
    state.checks.human=state.revision;return result('ok','HUMAN_REVIEW_PASSED',{scope:state.last_actor==='independent'?'escalated_unit_review':'sample_acceptance'});
   case 'trace_evidence':
    if(typeof observation.available!=='boolean')return result('blocked','INVALID_TOOL_RESULT');
    if(!observation.available){state.checks.evidence=null;return result('blocked','SOURCE_CHAIN_MISSING');}
    state.checks.evidence=state.revision;return result('ok','SOURCE_CHAIN_VERIFIED',{artifact_ref:'demo://synthetic-unit-A/r'+state.revision+'/evidence'});
   case 'release_unit':
    if(!checked()||state.checks.human!==state.revision||state.checks.evidence!==state.revision||state.checks.model!==state.revision&&state.last_actor!=='independent')return result('blocked','RELEASE_GATES_NOT_MET');
    state.phase='released';return result('ok','RELEASED',{artifact_ref:'demo://synthetic-unit-A/r'+state.revision+'/manifest'});
  }
 }
 const scenarios={normal:'全部检查通过',retry:'首次抽查失败，主模型重做后通过',escalate:'复抽仍失败，升级独立模型与人工',counts:'记录数量对不上',human:'人工审查证据不足',stale:'尝试用旧版本回执放行'};
 function runScenario(name){
  if(!Object.hasOwn(scenarios,name))throw Error('Unknown scenario');
  let state=createUnit(),index=0;
  function call(tool,input={},observation,revision=state.revision){
   const args=clone(tools.find(t=>t.name===tool).input);
   for(const key of Object.keys(args))if(key.endsWith('_ref'))args[key]=args[key].replace('/r1/','/r'+state.revision+'/');
   if(tool==='validate_records')args.plan_ref='demo://'+state.unit_id+'/plan-v'+state.revision;
   if(tool==='review_with_model')args.sample_ref='demo://'+state.unit_id+'/card/v'+state.card_version;
   const value=executeTool(state,{tool,unit_id:state.unit_id,revision,input_signature:state.input_signature,plan_signature:state.plan_signature,call_id:'demo-'+(++index),input:{...args,...input}},observation?{...observation,revision:state.revision}:undefined);state=value.state;return value;
  }
  function checks(mismatch=false){call('validate_records',{}, {errors:0});call('reconcile_counts',{}, {included:100,excluded:10,review:mismatch?9:10,unique_ids:120});}
  call('expand_file_card',{additional:12,seed:43});checks(name==='counts');
  if(name==='counts')return state;
  call('review_with_model',{}, {outcome:['retry','escalate','stale'].includes(name)?'fail':'pass'});
  if(['retry','escalate','stale'].includes(name)){
   call('redo_unit',{actor:'main'});call('expand_file_card',{additional:12,seed:44});checks();
   call('review_with_model',{}, {outcome:name==='escalate'?'fail':'pass'});
  }
  if(name==='escalate'){call('redo_unit',{actor:'independent'});checks();}
  call('expand_file_card',{additional:24,seed:45});
  call('request_human_review',{}, {decision:name==='human'?'insufficient':'pass',receipt:'synthetic-human-receipt'});
  if(name==='human')return state;
  call('trace_evidence',{}, {available:true});call('release_unit',{},undefined,name==='stale'?1:state.revision);return state;
 }
 function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),section=$('agent-harness');if(!section)return;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const buttons=[...section.querySelectorAll('[data-harness-tool]')];
  function select(name,focus=false){
   const tool=tools.find(t=>t.name===name);if(!tool)return;
   buttons.forEach(button=>{const active=button.dataset.harnessTool===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();});
   $('harness-tool-title').textContent=tool.label;$('harness-tool-guard').textContent=tool.guard;$('harness-tool-name').textContent=tool.name;
   $('harness-tool-panel').setAttribute('aria-labelledby','harness-tool-'+name);
   const example=runScenario('escalate'),receipt=example.journal.find(r=>r.tool===name);
   $('harness-tool-input').textContent=JSON.stringify(JSON.parse(example.cache[receipt.call_id].fingerprint),null,2);
   $('harness-tool-output').textContent=JSON.stringify(receipt,null,2);
  }
  buttons.forEach((button,i)=>{
   button.addEventListener('click',()=>select(button.dataset.harnessTool));
   button.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight'||e.key==='ArrowDown')n=(i+1)%buttons.length;if(e.key==='ArrowLeft'||e.key==='ArrowUp')n=(i+buttons.length-1)%buttons.length;if(e.key==='Home')n=0;if(e.key==='End')n=buttons.length-1;if(n!==undefined){e.preventDefault();select(buttons[n].dataset.harnessTool,true);}});
  });
  function render(){
   const state=runScenario($('harness-scenario').value);
   $('harness-phase').textContent=phases[state.phase];$('harness-phase').dataset.phase=state.phase;
   $('harness-revision').textContent='r'+state.revision;$('harness-card-size').textContent=String(state.selected.length);
   $('harness-retry-count').textContent=String(state.retries.main+state.retries.independent)+' / 2';
   $('harness-log').innerHTML=state.journal.map(r=>'<li data-tool="'+r.tool+'" data-status="'+r.status+'"><code>'+r.tool+'</code><span class="harness-log-status">'+outcomes[r.status]+'</span><span>r'+r.revision+'</span><small>'+esc(r.code)+'</small></li>').join('');
   $('harness-last-receipt').textContent=JSON.stringify(state.journal.at(-1),null,2);section.dataset.phase=state.phase;
  }
  $('harness-run').addEventListener('click',render);$('harness-scenario').addEventListener('change',render);
  select('review_with_model');render();section.dataset.ready='true';
 }
 return {tools,createUnit,executeTool,scenarios,runScenario,mount};
});
