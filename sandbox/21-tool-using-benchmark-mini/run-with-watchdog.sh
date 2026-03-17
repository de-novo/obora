#!/usr/bin/env bash
set -euo pipefail

if (( $# < 6 )); then
  echo "usage: run-with-watchdog.sh <log-file> <snapshot-file> <idle-timeout-sec> <safety-timeout-sec> <poll-sec> -- <command...>" >&2
  exit 64
fi

LOG_FILE="$1"
SNAPSHOT_FILE="$2"
IDLE_TIMEOUT_SEC="$3"
SAFETY_TIMEOUT_SEC="$4"
POLL_SEC="$5"
shift 5

if [[ "${1:-}" != "--" ]]; then
  echo "run-with-watchdog.sh: missing -- before command" >&2
  exit 64
fi
shift

mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$SNAPSHOT_FILE")"
: > "$LOG_FILE"

python3 - "$LOG_FILE" "$SNAPSHOT_FILE" "$IDLE_TIMEOUT_SEC" "$SAFETY_TIMEOUT_SEC" "$POLL_SEC" "$@" <<'PY'
import os, signal, subprocess, sys, time
from pathlib import Path

log_file = Path(sys.argv[1])
snapshot_file = Path(sys.argv[2])
idle_timeout = max(int(sys.argv[3]), 1)
safety_timeout = max(int(sys.argv[4]), 1)
poll_sec = max(int(sys.argv[5]), 1)
cmd = sys.argv[6:]

start = time.time()
last_progress = start
last_size = 0
reason = None

with log_file.open('ab', buffering=0) as log:
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0, preexec_fn=os.setsid)
    try:
        while True:
            progressed = False
            if proc.stdout is not None:
                chunk = proc.stdout.read1(4096) if hasattr(proc.stdout, 'read1') else proc.stdout.read(4096)
                while chunk:
                    log.write(chunk)
                    progressed = True
                    chunk = proc.stdout.read1(4096) if hasattr(proc.stdout, 'read1') else proc.stdout.read(4096)
            if progressed:
                last_progress = time.time()
                last_size = log_file.stat().st_size if log_file.exists() else 0

            code = proc.poll()
            now = time.time()
            if code is not None:
                break
            if now - start >= safety_timeout:
                reason = f"safety timeout after {safety_timeout}s"
                break
            size = log_file.stat().st_size if log_file.exists() else 0
            if size > last_size:
                last_progress = now
                last_size = size
            elif now - last_progress >= idle_timeout:
                reason = f"idle timeout after {idle_timeout}s without new log output"
                break
            time.sleep(poll_sec)

        if reason is not None:
            log.write(f"[watchdog] {reason}\n".encode())
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            deadline = time.time() + 10
            while time.time() < deadline and proc.poll() is None:
                time.sleep(0.2)
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            exit_code = 124
        else:
            if proc.stdout is not None:
                remainder = proc.stdout.read()
                if remainder:
                    log.write(remainder)
            exit_code = proc.wait()
    finally:
        content = log_file.read_bytes().splitlines()[-200:] if log_file.exists() else []
        snapshot_file.write_bytes(b"\n".join(content) + (b"\n" if content else b""))

sys.exit(exit_code)
PY
