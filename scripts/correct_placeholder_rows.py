"""Create a separately reconciled result revision for a verified placeholder group.

The completed run and model checkpoints remain immutable. This correction is
deliberately restricted to the audited source hash and exact three-cell pattern.
"""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

FID = 'cf25709f400a87b33269731c'
SHA256 = 'f5a50ee7c75d02087ec65582a816201c12af4744100e9189552c45a996ec5a57'
GROUP = '39cdeb246a966427e08ed8b5'
PATTERN = ['', '案卷编号', '']
VERSION = 'placeholder-quality-correction-v1'


def build(root, output):
    import duckdb
    root, output = root.resolve(), output.resolve()
    if output == root or root in output.parents:
        raise ValueError('Correction directory must be outside the completed run')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use a new empty revision directory')
    profiles = json.loads((root / '02_profiles/all_profiles_native.json').read_text())
    profile = next(p for p in profiles if p['file_id'] == FID)
    source = Path(profile['path'])
    if hashlib.sha256(source.read_bytes()).hexdigest() != SHA256:
        raise ValueError('Audited original source changed')
    csv.field_size_limit(16 * 1024 * 1024)
    first = last = None
    count = 0
    with source.open(encoding='gb18030', newline='') as stream:
        rows = csv.reader(stream, strict=True)
        assert next(rows) == ['序号', '案卷编号', '问题详细描述']
        for ordinal, row in enumerate(rows, 2):
            if row == PATTERN:
                first = first or ordinal
                last = ordinal
                count += 1
    assert (count, first, last) == (1048465, 112, 1048576)
    assert count == last - first + 1
    connection = duckdb.connect()
    connection.execute('SET threads=4')
    ledger = str(root / '08_results/record_ledger.parquet')
    connection.read_parquet(ledger).create_view('original')
    predicate = f"file_id = '{FID}' AND row BETWEEN {first} AND {last}"
    connection.execute('CREATE VIEW quality AS SELECT * FROM original WHERE ' + predicate)
    assert connection.execute('SELECT count(*) FROM quality').fetchone()[0] == count
    assert connection.execute("SELECT count(*) FROM quality WHERE status != 'NO_EVENT'").fetchone()[0] == 0
    for relative in ['07_entities/entity_mentions.parquet', '08_results/event_sources.parquet']:
        matches = connection.execute('SELECT count(*) FROM read_parquet(?) s JOIN quality q USING(record_id)', [str(root / relative)]).fetchone()[0]
        assert matches == 0, relative
    output.mkdir(parents=True, exist_ok=True)
    (output / '08_results').mkdir()
    (output / '05_quality').mkdir()
    corrected = output / '08_results/record_ledger.parquet'
    quality = output / '05_quality/placeholder_records.parquet'
    connection.execute("COPY (SELECT * FROM original WHERE NOT (" + predicate + ")) TO ? (FORMAT PARQUET, COMPRESSION ZSTD)", [str(corrected)])
    connection.execute("COPY (SELECT *, 'header_label_only_placeholder' AS quality_reason FROM quality) TO ? (FORMAT PARQUET, COMPRESSION ZSTD)", [str(quality)])
    statuses = dict(connection.execute('SELECT status,count(*) FROM read_parquet(?) GROUP BY status', [str(corrected)]).fetchall())
    methods = dict(connection.execute('SELECT method,count(*) FROM read_parquet(?) GROUP BY method', [str(corrected)]).fetchall())
    assert statuses == {'EXTRACTED': 6300941, 'NO_EVENT': 2332837, 'REVIEW': 6179034}
    assert sum(statuses.values()) == 14812812
    assert methods['local_llm_bounded_source_references'] == 388348
    assert methods['local_llm_exact_content_reuse'] == 3806
    assert 43653625 == 27792348 + count + sum(statuses.values())
    for path in (root / '08_results').iterdir():
        if path.name != 'record_ledger.parquet' and path.is_file():
            (output / '08_results' / path.name).symlink_to(path)
    summary = {
        'version': VERSION, 'corrected_at': datetime.now(timezone.utc).isoformat(),
        'quality_excluded_records': count, 'field_mapped_records': 14420658,
        'semantic_source_records': 392154, 'representative_records': 388348,
        'exact_duplicate_source_records': 3806, 'record_ledger': 14812812,
        'record_statuses': statuses, 'record_methods': methods,
        'known_records': 43653625, 'relevance_excluded_records': 27792348,
        'entities': 5202714, 'events': 5968620, 'event_sources': 6331400,
        'subject_and_event_sources_affected': 0, 'coverage_reconciled': True,
        'original_run_modified': False,
        'historical_model_progress_preserved': True,
        'audit_rule': {'source_sha256': SHA256, 'content_group': GROUP,
                       'file_id': FID, 'csv_row_range': [first, last],
                       'cells': PATTERN},
        'source_run': str(root), 'corrected_ledger': str(corrected),
        'quality_ledger': str(quality),
    }
    (output / 'correction.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-dir', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    args = parser.parse_args()
    build(args.run_dir, args.output_dir)
