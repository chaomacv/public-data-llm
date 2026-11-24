/* Compact, source-counted illustrations for the first four processing stages. */
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
 function render(index,d){
  if(index===0)return heading('多种格式，同一份输入台账')+'<div class="run-format-icons">'+['CSV','XLSX','DOCX','PDF','JPG','RAR'].map(type=>'<div class="run-format-item">'+icon(type)+'<span>'+type+'</span></div>').join('')+'</div><p class="run-visual-caption">原件保留，来源与哈希一起登记。</p>';
  if(index===1)return heading('每条来源，统计实际读取的文件','示意')+'<div class="run-read-head"><span>原始附件</span><span>实际读取</span></div><div class="run-read-rows">'+[['A.csv','A.csv','直接读取'],['B.zip','C.xlsx','解压'],['D.jpg','E.jsonl','OCR']].map(([source,target,method])=>'<div class="run-read-row">'+tile(source)+'<div class="run-read-route"><span>'+method+'</span><i aria-hidden="true">→</i></div>'+tile(target,true)+'</div>').join('')+'</div><p class="run-visual-caption"><span class="run-blue-key" aria-hidden="true"></span>蓝色文件计数；原件留作来源。</p>';
  if(index===2)return heading('模型看到的文件卡片','结构示例')+'<dl class="run-card-example"><dt>文件</dt><dd data-i18n-original>某区企业处罚公示.xlsx</dd><dt>工作表</dt><dd>处罚结果</dd><dt>追溯</dt><dd><code>file_id / scope_id</code></dd><dt>记录数</dt><dd>按完整读取计数</dd><dt>字段</dt><dd>企业名称、处罚文号、违法事实、处罚日期</dd><dt>样本</dt><dd>首3 · 中3 · 尾3 · 随机5，合并去重</dd><dt>来源</dt><dd>原始附件／压缩包成员</dd><dt>质量</dt><dd>表头待确认、列宽异常等标记</dd></dl>';
  if(index===3){
   const s=screeningView(d),pct=s.excluded_units/s.total_units*100;
   return heading('从文件筛选，到处理分流')+'<div class="run-screen-total"><strong>'+fmt(s.total_units)+'</strong><span>独立处理单元</span></div><div class="run-screen-track" role="img" aria-label="筛选排除 '+fmt(s.excluded_units)+'，继续处理 '+fmt(s.continuing_units)+'"><i style="width:'+pct.toFixed(4)+'%"></i><i style="width:'+(100-pct).toFixed(4)+'%"></i></div><div class="run-screen-outcomes"><div><span>筛选排除</span><strong>'+fmt(s.excluded_units)+'</strong></div><div><span>继续处理</span><strong>'+fmt(s.continuing_units)+'</strong></div></div><p class="run-screen-kept"><span>提取通道 '+fmt(s.actionable_units)+'</span><b aria-hidden="true">+</b><span>待复核 '+fmt(s.review_units)+'</span></p><p class="run-visual-caption">两轮排除统一计入文件筛选，后续按处理方式分流。</p>';
  }
  return '';
 }
 return {render,validateScreening,screeningView};
});
