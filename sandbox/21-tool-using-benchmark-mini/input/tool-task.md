# Tool Task

You must use Obora's local file tools to solve this benchmark honestly.

Required procedure:

1. Use `file_list` on `sandbox/21-tool-using-benchmark-mini/input/tool-data` to discover the report filenames.
2. Use `file_read` on the discovered JSON reports.
3. Derive the winner from the observed report contents.
4. Do not read `input/reference-answer.md` in the solve step.
5. In the attempt artifact, record which tools were used and summarize the observed tool output.

The benchmark is only correct if the final answer depends on the tool-discovered filenames and report contents.
