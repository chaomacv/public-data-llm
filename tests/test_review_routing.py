"""Synthetic routing regressions; no model service or corpus execution."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bank_data.bulk_rows import apply_plan,materialize_file,materialize,REVIEW_ROUTING_POLICY
from bank_data.bulk_semantics import finalize_validation
from bank_data.common import dump
from bank_data.scan import scan


class ReviewRoutingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        source=self.root/'input';source.mkdir();self.work=self.root/'work'
        (source/'合成待复核.csv').write_text('名称,说明\n合成甲公司,拟获支持\n合成乙公司,含义未明\n',encoding='utf-8')
        self.profiles,_=scan(source,self.work/'02_profiles');self.profile=self.profiles[0]
        self.card=self.profile['cards'][0];self.scope=self.card['scope_id']
        self.card['quality_flags']=['header_uncertain']
        self.plan={'mode':'review','reason':'名称角色不确定','entities':[],'events':[]}
        dump(self.work/'04_plans/scopes'/(self.scope+'.json'),
             {'signature':'synthetic-plan','plan':self.plan,'error':'synthetic validation failure'})

    def tearDown(self):self.temp.cleanup()

    def read_lines(self,path):
        return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines()]

    def test_review_is_queued_and_problem_survives_finalization(self):
        summary=materialize_file((self.profile,self.work));fid=self.profile['file_id']
        stage=self.work/'06_validation'/fid
        self.assertEqual((summary['pending_llm'],summary['mapped_records'],summary['review_routed_records']),(2,0,2))
        self.assertEqual(summary['review_routed_scopes'],1)
        issues=self.read_lines(stage/'review_routing_issues.jsonl');self.assertEqual(len(issues),1)
        issue=issues[0]
        self.assertEqual(issue['original_reason'],'名称角色不确定')
        self.assertEqual(issue['planner_error'],'synthetic validation failure')
        self.assertEqual(issue['quality_flags'],['header_uncertain'])
        self.assertEqual(issue['policy'],REVIEW_ROUTING_POLICY)
        self.assertEqual(issue['destination'],'row_llm')
        tasks=self.read_lines(stage/'pending_llm.jsonl')
        self.assertEqual({t['routing_issue_id'] for t in tasks},{issue['issue_id']})
        self.assertEqual(self.read_lines(stage/'mapped_results.jsonl'),[])
        # A resumed materialization keeps the same queue and stable issue identity.
        self.assertEqual(materialize_file((self.profile,self.work)),summary)
        self.assertEqual(self.read_lines(stage/'review_routing_issues.jsonl'),issues)
        dump(self.work/'06_validation/mapping_files.json',[summary])
        dump(self.work/'06_validation/llm_summary.json',{'signature':'synthetic-result'})
        for i,task in enumerate(tasks):
            result={'record_id':task['record_id'],'status':'NO_EVENT' if i==0 else 'REVIEW','entities':[],'events':[]}
            dump(stage/'llm_results'/(task['record_id']+'.json'),
                 {'signature':'synthetic-result','result':result,'errors':[]})
        final=finalize_validation(self.profiles,self.work)
        self.assertEqual(final['records'],2)
        results=self.read_lines(stage/'record_results.jsonl')
        self.assertEqual({r['routing_issue_id'] for r in results},{issue['issue_id']})
        self.assertEqual({r['status'] for r in results},{'NO_EVENT','REVIEW'})

    def test_problem_is_written_even_when_source_cannot_be_read(self):
        with patch('bank_data.bulk_rows.read_records',side_effect=ValueError('synthetic unreadable input')):
            with self.assertRaisesRegex(ValueError,'unreadable'):materialize_file((self.profile,self.work))
        path=self.work/'06_validation'/self.profile['file_id']/'review_routing_issues.jsonl'
        self.assertEqual(self.read_lines(path)[0]['scope_id'],self.scope)
        self.assertFalse((path.parent/'mapping_summary.json').exists())

    def test_exclusion_and_existing_semantics_keep_their_routes(self):
        row={'record_id':'synthetic'}
        result,reason,_=apply_plan(row,{},self.plan)
        self.assertIsNone(result);self.assertEqual(reason,'review_plan_requires_record_semantics')
        result,reason,_=apply_plan(row,{},dict(self.plan,mode='row_llm'))
        self.assertIsNone(result);self.assertEqual(reason,'requires_record_semantics')
        result,reason,_=apply_plan(row,{},dict(self.plan,mode='exclude'))
        self.assertEqual(result['status'],'NO_EVENT');self.assertEqual(reason,'plan_excluded')

    def test_batch_writes_scope_issue_index_without_model_inference(self):
        materialize(self.profiles,self.work,workers=1)
        issues=self.read_lines(self.work/'06_validation/review_routing_issues.jsonl')
        self.assertEqual(len(issues),1)
        summary=json.loads((self.work/'06_validation/mapping_summary.json').read_text(encoding='utf-8'))
        self.assertEqual(summary['review_routed_records'],2)
        self.assertEqual(summary['review_routed_scopes'],1)
