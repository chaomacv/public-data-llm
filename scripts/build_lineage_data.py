"""Build the public, count-conserving lineage story from completed aggregate exports."""
import argparse
import hashlib
import json
from pathlib import Path


def build(assets):
    def read(name):
        return json.loads((assets / name).read_text(encoding='utf-8'))
    final, run, gallery = [read(name) for name in ['final-results.json', 'run-summary.json', 'gallery-data.json']]
    correction = read('quality-correction.json')
    assert final['preparation']['quality_excluded_records'] == correction['quality_excluded_records']
    assert final['counts']['record_ledger'] == correction['record_ledger']
    assert correction['subject_and_event_sources_affected'] == 0 and correction['coverage_reconciled']
    if not run['validation']['final_audit_passed'] or not gallery['final_pipeline_complete']:
        raise ValueError('Completed batch required')
    c = {'events': final['counts']['events'], 'known': final['input']['known_logical_records'],
         'excluded': final['preparation']['excluded_records'],
         'retained': final['preparation']['retained_records'],
         'quality': final['preparation']['quality_excluded_records'],
         'mapped': final['preparation']['field_mapped_records'],
         'semantic': final['preparation']['pending_semantic_source_records'],
         'representatives': final['semantic_work']['representative_records'],
         'reused': final['semantic_work']['exact_duplicate_source_records']}
    outcomes = {row['status']: row['records'] for row in final['record_statuses']}
    equations = [{'total': 'known', 'parts': ['excluded', 'quality', 'retained']},
                 {'total': 'retained', 'parts': ['mapped', 'semantic']},
                 {'total': 'semantic', 'parts': ['representatives', 'reused']}]
    for row in equations:
        assert c[row['total']] == sum(c[key] for key in row['parts'])
    assert sum(outcomes.values()) == c['retained'] == final['counts']['record_ledger']
    assert gallery['progress']['scope'] == 'historical_execution_before_quality_correction'
    assert c['representatives'] + 1 == gallery['progress']['total']
    screening = run['screening']
    assert screening['total_units'] == run['input']['scopes']
    assert screening['total_units'] == screening['keep_units'] + screening['review_units'] + screening['excluded_units']
    assert screening['planned_units'] == screening['keep_units'] + screening['review_units'] == run['plans']['total']
    display_excluded = screening['excluded_units'] + run['plans']['exclude']
    display_continuing = sum(run['plans'][k] for k in ['map','entity_only','row_llm','review'])
    assert screening['total_units'] == display_excluded + display_continuing
    n = lambda key: f'{c[key]:,}'
    stages = [
        {'title': '固定输入', 'input': '5,200 份已接收原始附件',
         'output': '固定附件、来源及哈希台账；原件继续保留。',
         'flow': ['5,200 份附件进入本批；上游 22 个下载失败项另记，不计入成功输入。'],
         'files': ['01_inputs/input_ledger.json', '01_inputs/snapshot_integrity.json']},
        {'title': '解析与抽样', 'input': '5,200 份原附件及其容器成员',
         'output': '8,904 个有记录的可解析文件 → 13,281 个独立处理单元 → 43,653,625 条已知记录。',
         'flow': ['展开压缩包、读取表格和转换文档，保留来源关系。',
                  '可解析文件包括直接读取的原文件、解压成员和必要的转换结果；每条来源处理链统计实际读取的文件。'],
         'files': ['02_profiles/文件总表.csv', '02_profiles/all_profiles_native.json']},
        {'title': '文件筛选', 'input': '文件名、表头及分层样本组成的文件卡片',
         'output': f"{screening['total_units']:,} 个独立处理单元：筛选排除 {display_excluded:,}／继续处理 {display_continuing:,}（含待复核）。",
         'flow': ['模型先判断文件主题，不能把抽样行数当作完整文件记录数。',
                  '两轮排除在本页统一归入文件筛选；历史执行台账保留原阶段。'],
         'files': ['03_screen/筛选总表.csv', '03_screen/scopes/', '04_plans/字段方案总表.csv']},
        {'title': '处理方案', 'input': f"文件筛选后继续处理的 {display_continuing:,} 个独立处理单元，含待复核单元。",
         'output': '程序提取 1,347／仅主体信息 408／模型逐条理解 382／待复核 475，合计 2,612 个单元。',
         'flow': ['13,281 − 10,669 = 2,612；两轮排除已统一计入文件筛选。',
                  '提取通道 2,137 个单元，待复核 475 个单元；按字段规则、主体信息与逐条语义处理分流。',
                  '此处按业务环节归并展示；处理方式数量按单元计量，不与记录条数直接相减。'],
         'files': ['04_plans/字段方案总表.csv', '04_plans/config.json']},
        {'title': '完整读取与分流', 'input': f"{n('known')} 条已知逻辑记录及03–04决策",
         'output': f"相关性排除 {n('excluded')}；质量剔除 {n('quality')}；保留 {n('retained')} = 字段方案 {n('mapped')} + 复杂语义来源 {n('semantic')}。",
         'flow': [f"{n('known')} = {n('excluded')} + {n('quality')} + {n('retained')}",
                  f"{n('retained')} = {n('mapped')} + {n('semantic')}",
                  '质量剔除仅含表头标签的占位行；来源保留，后续处理统计不再包含这些行。'],
         'files': ['05_records/<file_id>/rows.jsonl', '05_records/<file_id>/contexts.json', '05_quality/placeholder_records.parquet', 'correction.json']},
        {'title': '抽取、复用与回填', 'input': f"字段方案 {n('mapped')} 条；复杂语义来源 {n('semantic')} 条",
         'output': f"复杂来源按完整内容分成 {n('representatives')} 个代表，复用 {n('reused')} 条来源；推理后回填到 {n('semantic')} 条。两通道合并为 {n('retained')} 条台账。",
         'flow': [f"{n('semantic')} = {n('representatives')} + {n('reused')}",
                  '仅同文件、同表、完整字段和语境一致才复用；逐条核对来源后回填。',
                  f"{n('representatives')} 是语义通道工作量，不是最终仅剩的记录数。",
                  f"合并后：EXTRACTED {outcomes['EXTRACTED']:,}／NO_EVENT {outcomes['NO_EVENT']:,}／REVIEW {outcomes['REVIEW']:,}。"],
         'files': ['correction.json', '08_results/record_ledger.parquet', '06_validation/content_indices/']},
        {'title': '身份关联', 'input': '8,800,229 条主体提及及其来源证据',
         'output': '5,202,714 个主体画像，包含 4,364,721 个临时身份。',
         'flow': ['代码校验、名称与非空地址用于保守关联；冲突和近名保留复核。',
                  '一条记录可以含多个提及；画像数不是逻辑记录数，也不等于独立登记企业数。'],
         'files': ['07_entities/results.duckdb', '07_entities/entity_mentions.parquet']},
        {'title': '结果导出', 'input': '逐条台账、主体关联与事件候选',
         'output': '14,812,812 条台账／5,202,714 个画像／5,968,620 条事件观察／6,331,400 条事件来源。',
         'flow': ['画像、事件与来源使用不同计量单位，不能相加或画成记录持续缩减。',
                  '分类修正保留原事件ID与来源，修正后的分类标签另存。'],
         'files': ['08_results/record_ledger.parquet', '08_results/profiles.parquet', '08_results/events.parquet', '08_results/event_sources.parquet']},
        {'title': '复核与覆盖对账', 'input': f"5,200 份原附件、{n('known')} 条已知逻辑记录及导出结果",
         'output': f"{n('retained')} 条处理台账 + {n('excluded')} 条相关性排除 + {n('quality')} 条质量剔除 = {n('known')} 条已知记录全部有去向。",
         'flow': ['导出回读与数量守恒通过；文件失败、结构问题及语义待复核分别保留。',
                  f"REVIEW {outcomes['REVIEW']:,} 条包含在处理台账中，不从分母再次扣除。"],
         'files': ['correction.json', '05_quality/placeholder_records.parquet', '08_results/record_ledger.parquet', '09_review/record_review.parquet']},
    ]
    points = [
        ('parsed', '解析总量', 'known', '条解析记录', 1, [stages[1]['output'], '统计解析器识别的完整记录。']),
        ('retained', '保留记录', 'retained', '条保留记录', 4, [stages[4]['output'], '经过相关性筛选与占位行质量清洗。']),
        ('events', '事件观察', 'events', '条事件观察', 7, ['两条处理通道的结果汇合，经主体关联与事件归并形成5,968,620条事件观察。', '此节点按事件计量；一条记录可不产生事件，也可包含多个事件。'])
    ]
    result = {'schema_version': 1, 'kind': 'completed_batch_lineage',
              'source_commit': final['source_commit'], 'completed_at': final['completed_at'],
              'hash_basis': 'utf8_lf_newlines',
              'source_sha256': {name: hashlib.sha256((assets / name).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
                                for name in ['final-results.json', 'run-summary.json', 'gallery-data.json', 'quality-correction.json']},
              'counts': c, 'outcomes': outcomes, 'equations': equations,
              'flow_axis': 'processing_stage_order_not_elapsed_time',
              'flow_scope': 'parsed_records_to_retained_records_to_event_observations',
              'flow_points': [{'id': ident, 'name': name, 'count': c[key], 'count_key': key,
                               'unit': unit, 'step': step, 'details': details}
                              for ident, name, key, unit, step, details in points],
              'stages': stages, 'progress': gallery['progress'],
              'quality_correction': final['quality_correction'],
              'timing_note': '时间曲线为质量更正前的历史执行观测，分母388,349；更正后业务口径代表388,348，不改写历史观测。阶段图按处理顺序排列，不虚构阶段完成时刻。时间图只使用真实观测；末点为最终验收时已全部完成，并非精确推理结束时刻。'}
    (assets / 'data-lineage.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Exported three main-flow lineage points, nine stages and actual progress observations.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets-dir', type=Path, default=Path('showcase/assets'))
    build(parser.parse_args().assets_dir)
