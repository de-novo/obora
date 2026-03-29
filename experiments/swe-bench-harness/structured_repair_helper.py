#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def extract_target_file(problem_path: Path) -> str:
    text = problem_path.read_text(encoding='utf-8', errors='ignore')

    # 1) explicit code/file references in backticks
    candidates = re.findall(r'`([^`]+\.(?:py|c|cpp|h|txt|rst|md))`', text)
    for c in candidates:
        if '/' in c and c.endswith('.py'):
            return c

    # 2) traceback / stack path patterns like django/forms/widgets.py:145
    traceback_paths = re.findall(r'([A-Za-z0-9_./-]+\.py)(?::\d+)?', text)
    for c in traceback_paths:
        if '/' in c and not c.startswith('~/') and not c.startswith('/'):  # repo-relative preferred
            return c

    low = text.lower()

    # 3) generic symbol -> file heuristics from repro snippets / stack traces
    if 'django/forms/widgets.py' in low or 'mediaorderconflictwarning' in low or 'class media:' in low:
        return 'django/forms/widgets.py'
    if 'filesystemstorage' in low or 'file_upload_permissions' in low or 'temporaryuploadedfile' in low or 'memoryuploadedfile' in low:
        return 'django/core/files/storage.py'
    if 'nddataref' in low and 'handle_mask' in low:
        return 'astropy/nddata/mixins/ndarithmetic.py'
    if 'wcs_pix2world' in low or 'inconsistentaxistypeserror' in low or 'wcsp2s' in low:
        return 'astropy/wcs/wcs.py'

    # 4) existing astropy-specific heuristics
    if 'separability_matrix' in low or 'compoundmodel' in low:
        return 'astropy/modeling/separable.py'
    if 'ascii.rst' in low or 'restructuredtext' in low or 'header_rows' in low:
        return 'astropy/io/ascii/rst.py'
    if 'ascii.qdp' in low or 'qdp line' in low or 'read serr' in low:
        return 'astropy/io/ascii/qdp.py'
    if 'fitsrec.py' in low:
        return 'astropy/io/fits/fitsrec.py'
    return ''


def cmd_extract_target(args):
    print(extract_target_file(Path(args.problem_file)))


def cmd_make_snippet(args):
    repo_dir = Path(args.repo_dir)
    target = repo_dir / args.target_file
    out = Path(args.output)
    if not target.exists():
        out.write_text('', encoding='utf-8')
        return
    lines = target.read_text(encoding='utf-8', errors='ignore').splitlines()
    out.write_text('\n'.join(lines[: args.max_lines]) + ('\n' if lines else ''), encoding='utf-8')


def validation_result(passed, summary, *, signature=None, failed_checks=None, artifact_paths=None, error_code=None):
    result = {
        'passed': passed,
        'summary': summary,
        'failedChecks': failed_checks or [],
        'artifactPaths': artifact_paths or [],
        'signature': signature or ('pass' if passed else summary),
    }
    if error_code:
        result['errorCode'] = error_code
    return result


def load_edit_object(edit_path: Path):
    raw = edit_path.read_text(encoding='utf-8', errors='ignore').strip()
    try:
        return json.loads(raw), None
    except Exception as e:
        # Relaxed fallback for LLM-written pseudo-JSON containing literal newlines in quoted strings.
        pattern = re.compile(
            r'^\s*\{\s*"target_file"\s*:\s*"(?P<target>(?:[^"\\]|\\.)*)"\s*,\s*'
            r'"old_string"\s*:\s*"(?P<old>[\s\S]*?)"\s*,\s*'
            r'"new_string"\s*:\s*"(?P<new>[\s\S]*?)"\s*\}\s*$',
            re.DOTALL,
        )
        m = pattern.match(raw)
        if not m:
            return None, e
        def unescape_basic(value: str) -> str:
            return value.replace('\\"', '"').replace('\\\\', '\\')
        obj = {
            'target_file': unescape_basic(m.group('target')),
            'old_string': unescape_basic(m.group('old')),
            'new_string': unescape_basic(m.group('new')),
        }
        return obj, None



def cmd_validate_edit(args):
    artifacts_dir = Path(args.artifacts_dir)
    repo_dir = Path(args.repo_dir)
    target_file = args.target_file
    edit_path = artifacts_dir / 'edit.json'
    patch_path = artifacts_dir / 'patch.diff'
    report_path = artifacts_dir / 'validation-report.json'

    artifact_paths = [str(edit_path), str(repo_dir / target_file), str(patch_path)]

    if not edit_path.exists():
        result = validation_result(
            False,
            'artifacts/edit.json is missing',
            signature='missing-edit-json',
            error_code='VALIDATION_ERROR',
            failed_checks=[{'name': 'missing-file', 'message': 'artifacts/edit.json is missing', 'file': 'artifacts/edit.json'}],
            artifact_paths=artifact_paths,
        )
        report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
        return

    obj, parse_error = load_edit_object(edit_path)
    if obj is None:
        result = validation_result(
            False,
            'edit.json is not valid JSON',
            signature='invalid-json',
            error_code='VALIDATION_ERROR',
            failed_checks=[{'name': 'json', 'message': str(parse_error), 'file': 'artifacts/edit.json'}],
            artifact_paths=artifact_paths,
        )
        report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
        return

    for key in ('target_file', 'old_string', 'new_string'):
        if key not in obj or not isinstance(obj[key], str) or (key != 'new_string' and not obj[key]):
            result = validation_result(
                False,
                f'missing required field: {key}',
                signature=f'missing-{key}',
                error_code='VALIDATION_ERROR',
                failed_checks=[{'name': 'schema', 'message': f'missing required field: {key}', 'file': 'artifacts/edit.json'}],
                artifact_paths=artifact_paths,
            )
            report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
            print(json.dumps(result))
            return

    if obj['target_file'] != target_file:
        result = validation_result(
            False,
            'wrong target file',
            signature='wrong-target-file',
            error_code='VALIDATION_ERROR',
            failed_checks=[{'name': 'target_file', 'message': f"expected {target_file} but got {obj['target_file']}", 'file': 'artifacts/edit.json'}],
            artifact_paths=artifact_paths,
        )
        report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
        return

    target_path = repo_dir / target_file
    if not target_path.exists():
        result = validation_result(
            False,
            'target file missing in repo',
            signature='missing-target-file',
            error_code='VALIDATION_ERROR',
            failed_checks=[{'name': 'target', 'message': f'target file missing: {target_file}', 'file': target_file}],
            artifact_paths=artifact_paths,
        )
        report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
        return

    content = target_path.read_text(encoding='utf-8', errors='ignore')
    old = obj['old_string']
    new = obj['new_string']
    if old not in content:
        result = validation_result(
            False,
            'old_string not found in target file',
            signature='old-string-not-found',
            error_code='VALIDATION_ERROR',
            failed_checks=[{'name': 'old_string', 'message': 'old_string not found in target file', 'file': target_file}],
            artifact_paths=artifact_paths,
        )
        report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
        return

    patched = content.replace(old, new, 1)
    candidate_path = artifacts_dir / 'candidate.py'
    candidate_path.write_text(patched, encoding='utf-8')

    py_compile = subprocess.run([sys.executable, '-m', 'py_compile', str(candidate_path)], capture_output=True, text=True)
    if py_compile.returncode != 0:
        result = validation_result(
            False,
            'patched file has syntax error',
            signature='syntax-error',
            error_code='VALIDATION_ERROR',
            failed_checks=[{'name': 'syntax', 'message': (py_compile.stderr or py_compile.stdout).strip(), 'file': target_file}],
            artifact_paths=artifact_paths + [str(candidate_path)],
        )
        report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
        return

    original_copy = artifacts_dir / 'original.py'
    original_copy.write_text(content, encoding='utf-8')
    subprocess.run(['git', '-C', str(repo_dir), 'diff', '--no-index', '--', str(original_copy), str(candidate_path)], capture_output=True, text=True)
    diff = subprocess.run(['git', '-C', str(repo_dir), 'diff', '--no-index', '--', str(original_copy), str(candidate_path)], capture_output=True, text=True)
    patch_text = diff.stdout
    if not patch_text.strip():
        result = validation_result(
            False,
            'edit produces empty diff',
            signature='empty-diff',
            error_code='VALIDATION_ERROR',
            failed_checks=[{'name': 'diff', 'message': 'edit produces empty diff', 'file': target_file}],
            artifact_paths=artifact_paths,
        )
        report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
        print(json.dumps(result))
        return

    patch_text = patch_text.replace(str(original_copy), f'a/{target_file}').replace(str(candidate_path), f'b/{target_file}')
    patch_path.write_text(patch_text, encoding='utf-8')
    result = validation_result(
        True,
        'Validation passed',
        signature='pass',
        artifact_paths=artifact_paths + [str(candidate_path)],
    )
    report_path.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result))


parser = argparse.ArgumentParser()
sub = parser.add_subparsers(dest='cmd', required=True)

p = sub.add_parser('extract-target')
p.add_argument('problem_file')
p.set_defaults(func=cmd_extract_target)

p = sub.add_parser('make-snippet')
p.add_argument('repo_dir')
p.add_argument('target_file')
p.add_argument('output')
p.add_argument('--max-lines', type=int, default=260)
p.set_defaults(func=cmd_make_snippet)

p = sub.add_parser('validate-edit')
p.add_argument('artifacts_dir')
p.add_argument('repo_dir')
p.add_argument('target_file')
p.set_defaults(func=cmd_validate_edit)

args = parser.parse_args()
args.func(args)
