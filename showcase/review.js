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
 function nextTab(index,key,total=5){
  if(key==='Home')return 0;if(key==='End')return total-1;
  if(key==='ArrowRight')return (index+1)%total;if(key==='ArrowLeft')return (index+total-1)%total;
  return null;
 }
 const awardStates=['已中标','拟中标','未中标'];
 // Recognize numeric text without converting or overwriting the source value.
 function isChineseNumber(value){
  const variants={'〇':'零','两':'二','兩':'二','壹':'一','贰':'二','貳':'二','叁':'三','參':'三','肆':'四','伍':'五','陆':'六','陸':'六','柒':'七','捌':'八','玖':'九','拾':'十','佰':'百','仟':'千','萬':'万','億':'亿','點':'点'};
  const s=[...value].map(c=>variants[c]||c).join('');
  if(!/^[零一二三四五六七八九十百千万亿点]+$/.test(s))return false;
  const parts=s.split('点');if(parts.length>2||parts.length===2&&!/^[零一二三四五六七八九]+$/.test(parts[1]))return false;
  function small(text){
   if(!text)return false;
   if(/^[零一二三四五六七八九]+$/.test(text))return true;
   let last=10000,digit=false,zero=false;
   for(let i=0;i<text.length;i++){
    const c=text[i],unit={十:10,百:100,千:1000}[c];
    if(unit){if(unit>=last||(!digit&&i!==0)||zero)return false;last=unit;digit=false;}
    else if(c==='零'){if(i===0||i===text.length-1||zero||digit)return false;zero=true;}
    else {if(digit)return false;digit=true;zero=false;}
   }
   return true;
  }
  function group(text,unit,lower){
   if(text===unit)return true;
   const p=text.split(unit);if(p.length===1)return lower(text);if(p.length!==2||!p[0]||/^零+$/.test(p[0])||!lower(p[0]))return false;
   if(!p[1])return true;
   const tail=p[1].replace(/^零/,'');return !!tail&&lower(tail);
  }
  const wan=t=>group(t,'万',small);
  return parts[0]?group(parts[0],'亿',wan):parts.length===2;
 }
 function isAmount(value){
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)&&Number.isFinite(Number(value))||isChineseNumber(value);
 }
 function validateAward(row){
  const errors=[],status=String(row.status??''),amount=String(row.amount??'').trim();
  if(!awardStates.includes(status))errors.push({field:'award_status',code:'ENUM_NOT_ALLOWED',value:status,rule:'STATUS_ENUM_V1'});
  if(!amount){
   if(status!=='未中标')errors.push({field:'award_amount',code:'AMOUNT_REQUIRED',value:amount,rule:'AMOUNT_REQUIRED_V1'});
  }else if(!isAmount(amount)){
   errors.push({field:'award_amount',code:'AMOUNT_NOT_DECIMAL',value:amount,rule:'AMOUNT_DECIMAL_V1'});
  }
  return {errors,action:errors.length?'complex_semantic':status==='已中标'?'confirmed':status==='拟中标'?'proposed':'no_event'};
 }
 function reviewRoute(first,second){
  if(!['pass','fail'].includes(first)||!['pass','fail'].includes(second))throw Error('Invalid review outcome');
  if(first==='pass')return ['external_sample','human_sample'];
  return ['external_sample','main_redo_unit','external_resample',...(second==='pass'?['human_sample']:['external_redo_unit','human_review_unit'])];
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
  function modelRoute(){
   const first=$('review-model-first').value,second=$('review-model-second').value;
   const labels={external_sample:'外部模型抽样核验',main_redo_unit:'修正问题后，主模型重做整个单元',external_resample:'新随机样本复抽＋原错例回归',external_redo_unit:'外部模型重做整个单元',human_sample:'人工抽样验收',human_review_unit:'人工审查，仍有错误则扩大到全单元'};
   $('review-model-route').innerHTML=reviewRoute(first,second).map(step=>'<li data-review-route="'+step+'">'+labels[step]+'</li>').join('');
   $('review-model-second-control').hidden=first==='pass';
  }
  $('review-model-first').addEventListener('change',modelRoute);$('review-model-second').addEventListener('change',modelRoute);modelRoute();
  function calculate(){const n=Number($('review-sample-n').value),p=Number($('review-error-rate').value);$('review-sample-n-value').textContent=String(n);const probability=detectionProbability(n,p);$('review-detection').textContent=probability<1&&probability>.999?'>99.9%':(100*probability).toFixed(1)+'%';}
  $('review-sample-n').addEventListener('input',calculate);$('review-error-rate').addEventListener('change',calculate);calculate();
  const response=await win.fetch('assets/data-lineage.json?v=main-flow-20261125');if(!response.ok)throw Error('Lineage unavailable');
  const data=win.BEILineage.validate(await response.json()),c=data.counts,fmt=n=>n.toLocaleString('en-US');
  const rows=[['已知记录',c.known,[c.excluded,c.quality,c.retained]],['处理分流',c.retained,[c.mapped,c.semantic]],['语义来源',c.semantic,[c.representatives,c.reused]]];
  $('review-accounting').innerHTML=rows.map(([label,total,parts])=>'<div><span>'+label+'</span><strong>'+fmt(total)+'</strong><small>= '+parts.map(fmt).join(' + ')+'</small></div>').join('');
  section.dataset.ready='true';
 }
 return {detectionProbability,nextTab,isChineseNumber,isAmount,validateAward,reviewRoute,mount};
});
