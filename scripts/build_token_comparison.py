"""Publish only aggregate token counts from the private tokenizer-only audit."""
import argparse
import json
from pathlib import Path


def publish(measurement):
    if measurement['phase']!='complete' or measurement['model_inference_executed'] is not False:
        raise ValueError('Requires a completed tokenizer-only measurement')
    units=measurement['units'];records=measurement['records'];tokens=measurement['input_tokens']
    if units!={'map':1347,'entity_only':408,'row_llm':382,'review':475}:raise ValueError('Unexpected unit scope')
    if sum(records.values())!=14812812 or measurement['quality_excluded']!=1048465:raise ValueError('Record accounting mismatch')
    cards=sum(measurement['card_tokens'].values());semantic=tokens['row_llm']+tokens['review'];baseline=sum(tokens.values())
    if baseline<=0 or any(type(v) is not int or v<0 for v in [*tokens.values(),*measurement['card_tokens'].values()]):
        raise ValueError('Invalid token counts')
    if cards!=measurement['card_input_tokens'] or cards+semantic!=measurement['hybrid_input_tokens'] or baseline!=measurement['all_record_input_tokens']:
        raise ValueError('Token accounting mismatch')
    if abs(measurement['input_ratio']-(cards+semantic)/baseline)>1e-12 or abs(measurement['input_reduction']-(1-(cards+semantic)/baseline))>1e-12:
        raise ValueError('Invalid token ratio')
    keys=['model','method','tokenizer_sha256','source_script_sha256','retained_records','card_input_tokens',
          'semantic_input_tokens','hybrid_input_tokens','all_record_input_tokens','input_ratio','input_reduction','scope','record_template']
    return {'schema_version':1,'kind':'token_routing_comparison','measured_on':'2026-11-25',
            **{k:measurement[k] for k in keys},'units':units,'records':records,'input_tokens':tokens,
            'card_tokens':measurement['card_tokens'],'quality_excluded':measurement['quality_excluded']}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('measurement',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();value=publish(json.loads(a.measurement.read_text(encoding='utf-8')))
    a.output.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Published aggregate input-token comparison only.')
