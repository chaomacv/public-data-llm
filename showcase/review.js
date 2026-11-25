(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root.document)api.mount(root).catch(()=>{const node=root.document.getElementById('review-accounting');if(node)node.textContent='对账汇总暂时不可用，请查看流程中的固定数量。';});
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function detectionProbability(n,p){
  if(!Number.isSafeInteger(n)||n<1||!Number.isFinite(p)||p<0||p>1)throw Error('Invalid sampling assumptions');
  if(p===0)return 0;if(p===1)return 1;
  return -Math.expm1(n*Math.log1p(-p));
 }
 function nextTab(index,key,total=4){
  if(key==='Home')return 0;if(key==='End')return total-1;
  if(key==='ArrowRight')return (index+1)%total;if(key==='ArrowLeft')return (index+total-1)%total;
  return null;
 }
 const awardStates=['已中标','拟中标','未中标'];
 function validateAward(row){
  const errors=[],status=String(row.status??''),amount=String(row.amount??'').trim();
  if(!awardStates.includes(status))errors.push({field:'award_status',code:'ENUM_NOT_ALLOWED',value:status,rule:'STATUS_ENUM_V1'});
  if(!amount){
   if(status!=='未中标')errors.push({field:'award_amount',code:'AMOUNT_REQUIRED',value:amount,rule:'AMOUNT_REQUIRED_V1'});
  }else if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount)||!Number.isFinite(Number(amount))){
   errors.push({field:'award_amount',code:'AMOUNT_NOT_DECIMAL',value:amount,rule:'AMOUNT_DECIMAL_V1'});
  }
  return {errors,action:errors.length?'complex_semantic':status==='已中标'?'confirmed':status==='拟中标'?'proposed':'no_event'};
 }
 async function mount(win){
  const doc=win.document,$=id=>doc.getElementById(id),section=$('review-mechanism');if(!section)return;
  const tabs=[...section.querySelectorAll('[data-review-tab]')];
  function select(index,focus=false){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(index===i));tab.tabIndex=index===i?0:-1;$(tab.getAttribute('aria-controls')).hidden=index!==i;});if(focus)tabs[index].focus();}
  tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>select(i));tab.addEventListener('keydown',e=>{const next=nextTab(i,e.key);if(next!==null){e.preventDefault();select(next,true);}});});select(0);
  const statusValues={confirmed:'已中标',proposed:'拟中标',not_awarded:'未中标',candidate:'中标候选'};
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function checkAward(){
   const checked=validateAward({amount:$('review-award-amount').value,status:statusValues[$('review-award-status').value]});
   const labels={confirmed:'校验通过：生成已中标事件。',proposed:'校验通过：生成拟中标事件。',no_event:'校验通过：不生成中标事件。',complex_semantic:'校验报错：记录问题，转入复杂语义处理。'};
   $('review-award-outcome').textContent=labels[checked.action];$('review-award-outcome').dataset.valid=String(!checked.errors.length);
   $('review-award-errors').innerHTML=checked.errors.map(e=>'<li><code>'+e.code+'</code><span>'+(e.field==='award_amount'?'中标金额（万元）':'中标状态')+'</span><span>原值：</span><b>'+esc(e.value||'空值')+'</b><small>synthetic-award.xlsx / results / row 14 / '+e.field+' / '+e.rule+'</small></li>').join('');
   $('review-award-errors').hidden=!checked.errors.length;
  }
  $('review-award-amount').addEventListener('input',checkAward);$('review-award-status').addEventListener('change',checkAward);checkAward();
  function calculate(){const n=Number($('review-sample-n').value),p=Number($('review-error-rate').value);$('review-sample-n-value').textContent=String(n);const probability=detectionProbability(n,p);$('review-detection').textContent=probability<1&&probability>.999?'>99.9%':(100*probability).toFixed(1)+'%';}
  $('review-sample-n').addEventListener('input',calculate);$('review-error-rate').addEventListener('change',calculate);calculate();
  const response=await win.fetch('assets/data-lineage.json?v=review-20261124');if(!response.ok)throw Error('Lineage unavailable');
  const data=win.BEILineage.validate(await response.json()),c=data.counts,fmt=n=>n.toLocaleString('en-US');
  const rows=[['已知记录',c.known,[c.excluded,c.quality,c.retained]],['处理分流',c.retained,[c.mapped,c.semantic]],['语义来源',c.semantic,[c.representatives,c.reused]]];
  $('review-accounting').innerHTML=rows.map(([label,total,parts])=>'<div><span>'+label+'</span><strong>'+fmt(total)+'</strong><small>= '+parts.map(fmt).join(' + ')+'</small></div>').join('');
  section.dataset.ready='true';
 }
 return {detectionProbability,nextTab,validateAward,mount};
});
