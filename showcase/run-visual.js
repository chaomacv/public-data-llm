/* Compact, source-counted illustrations for the processing stages. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root.document)root.BEIRunVisual=api;
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const fmt=n=>n.toLocaleString('en-US');
 function icon(type){
  return '<svg class="run-file-icon" viewBox="0 0 36 44" aria-hidden="true"><path d="M3 1h20l10 10v32H3Z"/><path d="M23 1v10h10"/>'+((type==='ZIP'||type==='RAR')?'<path class="file-zip" d="M18 14v5m-3 0v5m3 0v5"/>':'')+'<text x="18" y="'+((type==='ZIP'||type==='RAR')?37:29)+'" text-anchor="middle">'+type+'</text></svg>';
 }
 function tile(name,selected=false){
  const type=name.split('.').at(-1).toUpperCase();
  return '<div class="run-file-tile'+(selected?' is-read':'')+'">'+icon(type)+'<span data-i18n-original>'+name+'</span>'+(selected?'<span class="run-read-mark" aria-hidden="true">✓</span>':'')+'</div>';
 }
 const heading=(title,tag='')=>'<div class="run-visual-heading"><strong>'+title+'</strong>'+(tag?'<span>'+tag+'</span>':'')+'</div>';
 function validateScreening(d){
  const s=d.screening;
  if(!s||![s.total_units,s.keep_units,s.review_units,s.excluded_units,s.planned_units].every(Number.isSafeInteger)||
   Object.values(s).some(n=>n<0)||s.total_units!==d.input.scopes||s.planned_units!==d.plans.total||
   s.total_units!==s.keep_units+s.review_units+s.excluded_units||s.planned_units!==s.keep_units+s.review_units)
   throw Error('Screening units do not reconcile with field plans');
  return s;
 }
 function screeningView(d){
  const s=validateScreening(d),p=d.plans;
  if(![p.map,p.entity_only,p.row_llm,p.review,p.exclude].every(n=>Number.isSafeInteger(n)&&n>=0)||
   p.total!==p.map+p.entity_only+p.row_llm+p.review+p.exclude)throw Error('Plan modes do not reconcile');
  const excluded=s.excluded_units+p.exclude,actionable=p.map+p.entity_only+p.row_llm;
  if(s.total_units!==excluded+actionable+p.review)throw Error('Combined screening does not reconcile');
  return {total_units:s.total_units,excluded_units:excluded,continuing_units:actionable+p.review,
   actionable_units:actionable,review_units:p.review};
 }
 function readingFlow(d){
  const units=screeningView(d).continuing_units,p=d.preparation;
  if(![p.retained_records,p.field_mapped_records,p.pending_semantic_source_records].every(n=>Number.isSafeInteger(n)&&n>=0)||
   p.retained_records!==p.field_mapped_records+p.pending_semantic_source_records)throw Error('Reading routes do not reconcile');
  return {units,total:p.retained_records,field:p.field_mapped_records,semantic:p.pending_semantic_source_records};
 }
 function resultCounts(d){
  const c=d.final_counts;
  if(!c||![c.entity_mentions,c.entities,c.record_ledger,c.events,c.event_sources].every(n=>Number.isSafeInteger(n)&&n>=0)||
   c.record_ledger!==d.preparation.retained_records)throw Error('Final result counts do not reconcile');
  return c;
 }
 function auditFlow(d,outcomes){
  const c=resultCounts(d),p=d.preparation,total=d.input.known_logical_records;
  if(![total,p.excluded_records,p.quality_excluded_records].every(n=>Number.isSafeInteger(n)&&n>=0)||
   total!==p.excluded_records+p.quality_excluded_records+c.record_ledger||
   !outcomes||!['EXTRACTED','NO_EVENT','REVIEW'].every(k=>Number.isSafeInteger(outcomes[k])&&outcomes[k]>=0)||
   outcomes.EXTRACTED+outcomes.NO_EVENT+outcomes.REVIEW!==c.record_ledger)throw Error('Audit destinations do not reconcile');
  return {total,excluded:p.excluded_records,quality:p.quality_excluded_records,processed:c.record_ledger,review:outcomes.REVIEW};
 }
 function render(index,d,outcomes){
  if(index===0)return heading('多种格式，同一份输入台账')+'<div class="run-format-icons">'+['CSV','XLSX','DOCX','PDF','JPG','RAR'].map(type=>'<div class="run-format-item">'+icon(type)+'<span>'+type+'</span></div>').join('')+'</div><p class="run-visual-caption">原件保留，来源与哈希一起登记。</p>';
  if(index===1)return heading('每条来源，统计实际读取的文件','示意')+'<div class="run-read-head"><span>原始附件</span><span>实际读取</span></div><div class="run-read-rows">'+[['A.csv','A.csv','直接读取'],['B.zip','C.xlsx','解压'],['D.jpg','E.jsonl','OCR']].map(([source,target,method])=>'<div class="run-read-row">'+tile(source)+'<div class="run-read-route"><span>'+method+'</span><i aria-hidden="true">→</i></div>'+tile(target,true)+'</div>').join('')+'</div><p class="run-visual-caption"><span class="run-blue-key" aria-hidden="true"></span>蓝色文件计数；原件留作来源。</p>';
  if(index===2)return renderScreening(d);
  if(index===3){
   screeningView(d);
   const examples=[
    ['map','程序提取','<div class="run-plan-mapping"><span>单位名称</span><i aria-hidden="true">→</i><span>企业名称</span><span>决定日期</span><i aria-hidden="true">→</i><span>事件日期</span></div>','字段理解一次，程序逐行引用原值。'],
    ['entity_only','仅主体信息','<p class="run-plan-sample">企业名称 · 地址 · 信用代码</p>','保留主体资料，不生成事件。'],
    ['row_llm','模型逐条理解','<p class="run-plan-sample">甲公司拟获支持；乙公司已获批准。</p><div class="run-plan-stages"><span>甲：拟议</span><span>乙：已确认</span></div>','结合语义，区分主体与事件阶段。'],
    ['review','原待复核 → 复杂语义','<p class="run-plan-sample">“名称”列：企业？项目？</p><span class="routing-pending">已实现 · 复杂语义后备通道</span>','转入模型逐条理解，原原因和质量问题保留。']
   ];
   return heading('四类处理方式，四个小例子','说明示例')+'<div class="run-plan-examples">'+examples.map(([mode,title,example,caption])=>'<section class="run-plan-example" data-plan-mode="'+mode+'"><div class="run-plan-example-heading"><h4>'+title+'</h4><span>'+fmt(d.plans[mode])+'</span></div>'+example+'<p class="run-plan-caption">'+caption+'</p></section>').join('')+'</div>';
  }
  if(index===4){
   const f=readingFlow(d);
   return heading('从处理单元，到完整记录')+'<div class="run-record-flow"><div class="run-record-unit"><strong>'+fmt(f.units)+'</strong><span>独立处理单元</span></div><div class="run-record-connector" aria-hidden="true"></div><div class="run-record-total"><strong>'+fmt(f.total)+'</strong><span>条清洗后记录</span></div><div class="run-record-split"><div class="run-record-branch"><span>字段方案</span><strong>'+fmt(f.field)+'</strong><small>含待复核</small></div><div class="run-record-branch"><span>复杂语义来源</span><strong>'+fmt(f.semantic)+'</strong></div></div></div><p class="run-visual-caption">另有 '+fmt(d.preparation.quality_excluded_records)+' 条占位行，单列质量剔除。</p>';
  }
  if(index===5){
   const steps=[
    ['组织输入','表头 · 语境 · 来源编号'],
    ['精确去重','同表原值与语境完全一致才复用'],
    ['本地模型提取','主体 · 事件 · 阶段 · 证据'],
    ['程序核验','结构 · 原文引用 · 来源归属'],
    ['逐来源回填','保留每条记录与来源位置']
   ];
   return heading('复杂语义数据，五步处理')+'<ol class="run-semantic-steps" aria-label="复杂语义处理步骤">'+steps.map(([title,caption],i)=>'<li><span class="run-semantic-number" aria-hidden="true">'+(i+1)+'</span><div><strong>'+title+'</strong><span>'+caption+'</span></div></li>').join('')+'</ol><p class="run-semantic-review">不确定项进入复核</p>';
  }
  if(index===6){
   const c=resultCounts(d);
   return heading('多条来源，关联到同一画像','关联示意')+
    '<div class="run-identity-sources">'+['表A','表B'].map(name=>'<div><span>'+name+'</span><strong>企业名称＋信用代码</strong><small>标识 X</small></div>').join('')+'</div>'+
    '<svg class="run-identity-join" viewBox="0 0 300 34" aria-hidden="true"><path d="M75 0V12H225V0M150 12V34"/></svg>'+
    '<div class="run-identity-rule">标识一致 · 无冲突</div><div class="run-identity-target"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 28V5h18v23M3 28h26M12 10h2m4 0h2m-8 5h2m4 0h2m-8 5h2m4 0h2m-5 8v-4h2v4"/></svg><strong>同一主体画像</strong></div>'+
    '<div class="run-identity-review"><span>名称相近、证据不足</span><i aria-hidden="true">→</i><strong>保留独立身份／复核</strong></div>'+
    '<div class="run-identity-counts"><div><strong>'+fmt(c.entity_mentions)+'</strong><span>主体提及</span></div><i aria-hidden="true">→</i><div><strong>'+fmt(c.entities)+'</strong><span>主体画像</span></div></div><p class="run-visual-caption">本批汇总，画像包含临时身份；提及与画像分别计量。</p>';
  }
  if(index===7){
   const c=resultCounts(d),files=[['处理台账',c.record_ledger,'条记录'],['主体画像',c.entities,'个画像'],['事件观察',c.events,'条事件观察'],['事件来源链接',c.event_sources,'条来源链接']];
   return heading('四类结果，分别保存')+'<div class="run-export-root">处理结果</div><div class="run-export-files">'+files.map(([label,count,unit])=>'<div class="run-export-file">'+icon('DATA')+'<div><span>'+label+'</span><strong>'+fmt(count)+'</strong><small>'+unit+'</small></div></div>').join('')+'</div><div class="run-export-trace"><span>画像／事件</span><i aria-hidden="true">→</i><span>来源链接</span><i aria-hidden="true">→</i><span>记录位置</span></div><p class="run-visual-caption">四类结果分别导出，数量分别计量。</p>';
  }
  if(index===8){
   const f=auditFlow(d,outcomes),parts=[['相关性排除',f.excluded,'excluded'],['质量剔除',f.quality,'quality'],['处理台账',f.processed,'processed']];
   const checks=[['输入覆盖',d.validation.final_audit_passed],['数量守恒',true],['导出回读',d.validation.exports_round_trip_validated]];
   return heading('每条记录，都有去向')+'<div class="run-audit-bar" role="img" aria-label="相关性排除、质量剔除和处理台账按记录数量占比绘制">'+parts.map(([,count,key])=>'<span class="is-'+key+'" style="width:'+(count/f.total*100).toFixed(6)+'%"></span>').join('')+'</div><div class="run-audit-equation">'+parts.map(([label,count,key],i)=>'<div class="is-'+key+'"><i aria-hidden="true">'+(i?'+':'')+'</i><span>'+label+'</span><strong>'+fmt(count)+'</strong></div>').join('')+'<div class="run-audit-total"><i aria-hidden="true">=</i><span>解析记录</span><strong>'+fmt(f.total)+'</strong></div></div><div class="run-audit-review"><span>处理台账内</span><i aria-hidden="true">→</i><strong>待复核 '+fmt(f.review)+'</strong><small>已包含在台账中</small></div><div class="run-audit-checks">'+checks.map(([label,passed])=>'<span data-passed="'+Boolean(passed)+'"><i aria-hidden="true">'+(passed?'✓':'○')+'</i>'+label+'</span>').join('')+'</div><p class="run-visual-caption">语义准确率另行评测。</p>';
  }
  return '';
 }
 function renderScreening(d){
   const s=screeningView(d),pct=s.excluded_units/s.total_units*100;
   return heading('从文件筛选，到处理分流')+'<div class="run-screen-total"><strong>'+fmt(s.total_units)+'</strong><span>独立处理单元</span></div><div class="run-screen-track" role="img" aria-label="筛选排除 '+fmt(s.excluded_units)+'，继续处理 '+fmt(s.continuing_units)+'"><i style="width:'+pct.toFixed(4)+'%"></i><i style="width:'+(100-pct).toFixed(4)+'%"></i></div><div class="run-screen-outcomes"><div><span>筛选排除</span><strong>'+fmt(s.excluded_units)+'</strong></div><div><span>继续处理</span><strong>'+fmt(s.continuing_units)+'</strong></div></div><p class="run-screen-kept"><span>提取通道 '+fmt(s.actionable_units)+'</span><b aria-hidden="true">+</b><span>待复核 '+fmt(s.review_units)+'</span></p>';
 }
 function renderDetail(index,d){
  if(index===4){
   const examples=[
    ['字段方案','采购中标表','中标单位、项目、中标金额分别成列。','确认字段含义后，程序逐行引用原值。'],
    ['字段方案','企业基本信息表','企业名称、信用代码、地址分别成列。','保留主体资料，不凭空生成事件。'],
    ['复杂语义','一句话包含多个主体','合成甲公司拟获支持；合成乙公司已获批准。','交给模型区分主体与对应阶段。'],
    ['复杂语义','当前结果与历史情况交织','合成丙公司本次检查未发现违法行为；此前曾被责令整改。','区分当前检查与历史信息，不推断本次处罚。']
   ];
   return heading('两条处理通道，各看两个例子','合成示意')+'<div class="run-route-examples">'+examples.map(([route,title,input,action])=>'<section class="run-route-example"><span>'+route+'</span><h4>'+title+'</h4><p>'+input+'</p><small>'+action+'</small></section>').join('')+'</div>';
  }
  if(index===2)return heading('模型看到的文件卡片','结构示例')+'<dl class="run-card-example"><dt>文件</dt><dd data-i18n-original>某区企业处罚公示.xlsx</dd><dt>工作表</dt><dd>处罚结果</dd><dt>追溯</dt><dd><code>file_id / scope_id</code></dd><dt>记录数</dt><dd>按完整读取计数</dd><dt>字段</dt><dd>企业名称、处罚文号、违法事实、处罚日期</dd><dt>样本</dt><dd>首3 · 中3 · 尾3 · 随机5，合并去重</dd><dt>来源</dt><dd>原始附件／压缩包成员</dd><dt>质量</dt><dd>表头待确认、列宽异常等标记</dd></dl>';
  return '';
 }
 return {render,renderDetail,validateScreening,screeningView,readingFlow,resultCounts,auditFlow};
});
