## DX Roadmap (Draft)

### Goals

- Make project creation and preset application fast, predictable, and auditable.
- Support multi-tool composition (toolchains can be mixed or standalone).
- Reduce repetitive token usage by automating common setup steps.

### Scope

- CLI-driven workflow (`obora create/add/remove/upgrade/doctor`)
- Template + preset composition
- Preset compatibility/target selection

### Proposed DX Enhancements

1. Preset Doctor+
   - Validate installed presets against manifest definitions.
   - Report missing env vars, expected files, and marker injections.
   - Output JSON for CI usage.

2. Preset Plan (Dry Run)
   - Show file/dependency/script changes before apply.
   - Allow `--apply` to execute after review.

3. Preset Migrate
   - Versioned migrations for preset upgrades.
   - Auto-apply structural changes.

4. Target Selection Persistence
   - Save chosen target (e.g., drizzle: sqlite/postgres) per preset.
   - Reuse on upgrade/add for consistency.

5. Preset Lockfile
   - Record selected presets + targets + versions.
   - Enable deterministic rebuilds and CI checks.

6. Project Recipe
   - Save and reuse preset/app selections as recipes.
   - Shareable team standards.

7. Compatibility Graph
   - Capability-based checks with suggested resolutions.
   - Clearer conflict explanations.

8. Env Bootstrap
   - Guided env init from manifest requirements.
   - Optional secrets template output.

9. Preset Sandbox Test
   - Create ephemeral project to validate preset quickly.
   - Auto-clean on success/failure.

10. Post-Create Guidance

- Tailored "next steps" based on presets and targets.

### Proposed Order (MVP-first)

- Preset Doctor+ (smallest user friction, immediate value)
- Target Selection Persistence
- Preset Plan (Dry Run)
- Preset Lockfile
- Preset Migrate
- Project Recipe
- Compatibility Graph
- Env Bootstrap
- Preset Sandbox Test

### Notes

- Preset manifests use a single schema (`preset.schema.json`). Targets/variants are the default.
- Operations-based manifests are removed.
- Alias handling must be consistent across create/add/remove/upgrade.
- Avoid copying `node_modules` from templates to reduce IO and size.
