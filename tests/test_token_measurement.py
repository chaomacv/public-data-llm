"""Check aggregation/privacy without inference, tokenizer downloads or corpus IO."""
import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('token_publisher',Path(__file__).resolve().parents[1]/'scripts/build_token_comparison.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


def fixture():
    d={'phase':'complete','model_inference_executed':False,'model':'synthetic',
       'method':'uniform_single_record_input_v1','scope':'synthetic_fixture','record_template':'synthetic',
       'source_script_sha256':'a'*64,'tokenizer_sha256':'b'*64,
       'units':{'map':1347,'entity_only':408,'row_llm':382,'review':475},
       'records':{'map':11840748,'entity_only':1946147,'row_llm':392154,'review':633763},
       'input_tokens':{'map':18000000000,'entity_only':2000000000,'row_llm':1000000000,'review':2000000000},
       'card_tokens':{'map':5000000,'entity_only':1000000},'quality_excluded':1048465,
       'retained_records':14812812,'card_input_tokens':6000000,'semantic_input_tokens':3000000000,
       'hybrid_input_tokens':3006000000,'all_record_input_tokens':23000000000,
       'private_path':'/private/secret','file_id':'private-synthetic-id'}
    d['input_ratio']=d['hybrid_input_tokens']/d['all_record_input_tokens'];d['input_reduction']=1-d['input_ratio'];return d


class TokenPublisherTests(unittest.TestCase):
    def test_publish_preserves_exact_scope_and_strips_private_fields(self):
        d=fixture();result=module.publish(d)
        self.assertNotIn('file_id',result);self.assertNotIn('private_path',result)
        self.assertEqual(result['hybrid_input_tokens'],result['card_input_tokens']+result['semantic_input_tokens'])
        self.assertEqual(result['records'],d['records']);self.assertEqual(result['units'],d['units'])

    def test_incomplete_or_inconsistent_measurements_cannot_be_published(self):
        for key,value in [('phase','token_count_only'),('model_inference_executed',True),('input_ratio',.99),
                          ('quality_excluded',0),('hybrid_input_tokens',1)]:
            d=fixture();d[key]=value
            with self.assertRaises(ValueError):module.publish(d)
        d=fixture();d['records']['review']+=1
        with self.assertRaises(ValueError):module.publish(d)
