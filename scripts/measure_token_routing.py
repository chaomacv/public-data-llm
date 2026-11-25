"""Count Qwen input tokens for a fixed routing comparison; never call a model.

All retained records use the same one-record chat template. File-level context
is a separate user message, so its tokens can be counted once and multiplied
without approximating BPE boundaries. Original source records are read only.
"""
import argparse
from collections import Counter
from concurrent.futures import ProcessPoolExecutor,as_completed
import hashlib
import json
from multiprocessing import get_context
import os
from pathlib import Path
import sys
import time


def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(4*1024*1024),b''):h.update(block)
    return h.hexdigest()


def initialize(tokenizer_dir):
    global TOKENIZER
    os.environ.update(HF_HUB_OFFLINE='1',TOKENIZERS_PARALLELISM='true',RAYON_NUM_THREADS='2')
    from transformers import AutoTokenizer
    TOKENIZER=AutoTokenizer.from_pretrained(tokenizer_dir,local_files_only=True,trust_remote_code=False)


def count_file(task):
    root,out,fid,scopes,signature=task;root=Path(root);out=Path(out)
    raw=root/'05_records'/fid/'rows.jsonl';contexts_path=raw.parent/'contexts.json'
    if not raw.exists():raise ValueError('Missing readable source records: '+fid)
    key=hashlib.sha256(json.dumps([signature,raw.stat().st_size,raw.stat().st_mtime_ns,digest(contexts_path),scopes],sort_keys=True).encode()).hexdigest()
    cache=out/'files'/(fid+'.json')
    if cache.exists():
        prior=json.loads(cache.read_text())
        if prior['cache_key']==key:return prior
    contexts=json.loads(contexts_path.read_text());counts=Counter();tokens=Counter();quality=0;h=hashlib.sha256()
    batch=[];modes=[];fixed=[]
    def flush():
        if not batch:return
        encoded=TOKENIZER(batch,add_special_tokens=False,padding=False,truncation=False,return_attention_mask=False)['input_ids']
        for mode,base,ids in zip(modes,fixed,encoded):counts[mode]+=1;tokens[mode]+=base+len(ids)
        batch.clear();modes.clear();fixed.clear()
    with raw.open('rb') as stream:
        for line in stream:
            h.update(line);r=json.loads(line);spec=scopes.get(r['scope_id'])
            if spec is None:continue
            if fid=='cf25709f400a87b33269731c' and 112<=r['row']<=1048576:
                cells=r['cells']
                if cells.get('案卷编号')=='案卷编号' and all(not str(v).strip() for k,v in cells.items() if k!='案卷编号'):
                    quality+=1;continue
            record={k:r[k] for k in ('record_id','sheet','row','cells')}
            record['context']={**contexts[r['context_id']],**r['context']}
            text=json.dumps(record,ensure_ascii=False)
            batch.append(spec['dynamic_prefix']+text+spec['suffix']);modes.append(spec['mode']);fixed.append(spec['fixed_tokens'])
            if len(batch)>=1024:flush()
    flush()
    result={'file_id':fid,'cache_key':key,'raw_sha256':h.hexdigest(),'records':dict(counts),'input_tokens':dict(tokens),'quality_excluded':quality}
    cache.parent.mkdir(parents=True,exist_ok=True);cache.write_text(json.dumps(result),encoding='utf-8');return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--run',type=Path,required=True);p.add_argument('--tokenizer-dir',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--workers',type=int,default=16)
    a=p.parse_args();a.run=a.run.resolve();a.output=a.output.resolve()
    if a.output==a.run or a.output.is_relative_to(a.run):raise ValueError('Output must be outside the historical run')
    a.output.mkdir(parents=True,exist_ok=True)
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
    from bank_data.common import resource,ontology
    initialize(str(a.tokenizer_dir));tok=TOKENIZER;start=time.monotonic()
    signature=digest(__file__)+digest(a.tokenizer_dir/'tokenizer.json')
    modes=Counter();card_tokens=Counter();by_file={};missing=[]
    profiles=json.loads((a.run/'02_profiles/all_profiles_native.json').read_text(encoding='utf-8'))
    cards=(card for profile in profiles for card in profile['cards'])
    for card in cards:
        scope=card['scope_id'];path=a.run/'04_plans/scopes'/(scope+'.json')
        if not path.exists():continue
        plan=json.loads(path.read_text());mode=plan['plan']['mode']
        if mode not in ('map','entity_only','row_llm','review'):continue
        modes[mode]+=1
        if mode in ('map','entity_only'):
            request=plan.get('request')
            if not request:raise ValueError('Missing file-card request for programmatic plan')
            card_tokens[mode]+=len(tok.apply_chat_template(request['messages'],tokenize=True,add_generation_prompt=True,enable_thinking=False))
        context={k:card[k] for k in ('filename','sheet','columns','source')}
        messages=[{'role':'system','content':resource('extract.md')},
                  {'role':'user','content':json.dumps({'context':context,'event_types':ontology()['events']},ensure_ascii=False)}]
        marker='TOKEN_AUDIT_RECORD_MARKER_20261125'
        full=tok.apply_chat_template(messages+[{'role':'user','content':marker}],tokenize=False,add_generation_prompt=True,enable_thinking=False)
        prefix,suffix=full.split(marker);boundary=prefix.rindex('<|im_start|>user')
        fixed_prefix=prefix[:boundary];dynamic_prefix=prefix[boundary:]
        fixed_tokens=len(tok.encode(fixed_prefix,add_special_tokens=False))
        # A special token starts the dynamic part; verify exact concatenation.
        probe=json.dumps({'record_id':'token-audit-probe','cells':{'value':'示例 120.00'}},ensure_ascii=False)
        joined=tok.encode(full.replace(marker,probe),add_special_tokens=False)
        assert joined==tok.encode(fixed_prefix,add_special_tokens=False)+tok.encode(dynamic_prefix+probe+suffix,add_special_tokens=False)
        by_file.setdefault(card['file_id'],{})[scope]={'mode':mode,'fixed_tokens':fixed_tokens,'dynamic_prefix':dynamic_prefix,'suffix':suffix}
    if dict(modes)!={'map':1347,'entity_only':408,'row_llm':382,'review':475}:raise ValueError('Unexpected active unit scope: '+str(modes))
    del profiles,cards
    progress={'phase':'token_count_only','units':dict(modes),'files_total':len(by_file),'files_completed':0,'records':{},'input_tokens':{},'card_tokens':dict(card_tokens)}
    print(json.dumps(progress),flush=True)
    tasks=[(str(a.run),str(a.output),fid,scopes,signature) for fid,scopes in by_file.items()]
    counts=Counter();tokens=Counter();quality=0;done=0
    with ProcessPoolExecutor(max_workers=a.workers,mp_context=get_context('spawn'),initializer=initialize,initargs=(str(a.tokenizer_dir),)) as pool:
        for f in as_completed([pool.submit(count_file,t) for t in tasks]):
            result=f.result();counts.update(result['records']);tokens.update(result['input_tokens']);quality+=result['quality_excluded'];done+=1
            progress.update(files_completed=done,records=dict(counts),input_tokens=dict(tokens),quality_excluded=quality,seconds=round(time.monotonic()-start,1))
            (a.output/'progress.json').write_text(json.dumps(progress),encoding='utf-8')
            if done%25==0 or done==len(tasks):print(json.dumps(progress),flush=True)
    total=sum(counts.values());baseline=sum(tokens.values());semantic=tokens['row_llm']+tokens['review'];cards=sum(card_tokens.values());hybrid=semantic+cards
    assert total==14812812 and quality==1048465,(total,quality)
    result={**progress,'phase':'complete','model':'Qwen3-8B','tokenizer_sha256':digest(a.tokenizer_dir/'tokenizer.json'),
            'method':'uniform_single_record_input_v1','source_script_sha256':digest(__file__),
            'retained_records':total,'card_input_tokens':cards,'semantic_input_tokens':semantic,'hybrid_input_tokens':hybrid,
            'all_record_input_tokens':baseline,'input_ratio':hybrid/baseline,'input_reduction':1-hybrid/baseline,
            'model_inference_executed':False,'scope':'post_screening_input_tokens_only_no_outputs_retries_or_batching',
            'record_template':'system extract prompt; user file context and ontology; user complete record; Qwen chat wrapper'}
    (a.output/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result),flush=True)


if __name__=='__main__':main()
