import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseSkillMd, loadSkillMdDirectory, SkillRegistry } from "../../skills/registry";

describe("parseSkillMd", () => {
  it("should parse valid SKILL.md content with frontmatter", () => {
    const content = `---
name: test-skill
description: A test skill for testing
version: "1.0.0"
---

# Instructions

This is the skill body.
`;

    const result = parseSkillMd(content);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("test-skill");
    expect(result!.frontmatter.description).toBe("A test skill for testing");
    expect(result!.frontmatter.version).toBe("1.0.0");
    expect(result!.body).toBe("# Instructions\n\nThis is the skill body.");
  });

  it("should parse frontmatter with quoted values", () => {
    const content = `---
name: "quoted-name"
description: 'A description with "quotes"'
---

Body content`;

    const result = parseSkillMd(content);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("quoted-name");
    expect(result!.frontmatter.description).toBe('A description with "quotes"');
  });

  it("should parse dependencies array", () => {
    const content = `---
name: skill-with-deps
description: Has dependencies
dependencies: ["dep1", "dep2"]
---

Body`;

    const result = parseSkillMd(content);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.dependencies).toEqual(["dep1", "dep2"]);
  });

  it("should handle empty dependencies array", () => {
    const content = `---
name: skill-no-deps
description: No dependencies
dependencies: []
---

Body`;

    const result = parseSkillMd(content);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.dependencies).toEqual([]);
  });

  it("should normalize non-array dependencies to an empty list", () => {
    const content = `---
name: skill-with-invalid-deps
description: Has invalid dependencies
dependencies: base-skill
unknown: ignored
---

Body`;

    const result = parseSkillMd(content);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.dependencies).toEqual([]);
  });

  it("should return null for missing frontmatter", () => {
    const content = `# No frontmatter
Just markdown content`;

    const result = parseSkillMd(content);

    expect(result).toBeNull();
  });

  it("should return null for missing required fields", () => {
    const content = `---
name: only-name
---

Body`;

    const result = parseSkillMd(content);

    expect(result).toBeNull();
  });

  it("should return null for missing description", () => {
    const content = `---
description: only-description
---

Body`;

    const result = parseSkillMd(content);

    expect(result).toBeNull();
  });

  it("should handle CRLF line endings", () => {
    const content = "---\r\nname: crlf-skill\r\ndescription: CRLF test\r\n---\r\nBody";

    const result = parseSkillMd(content);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("crlf-skill");
    expect(result!.frontmatter.description).toBe("CRLF test");
  });

  it("should handle multiline body content", () => {
    const content = `---
name: multiline-skill
description: Multiline test
---

# Header

Paragraph 1

## Subheader

- Item 1
- Item 2

\`\`\`typescript
const code = true;
\`\`\`
`;

    const result = parseSkillMd(content);

    expect(result).not.toBeNull();
    expect(result!.body).toContain("# Header");
    expect(result!.body).toContain("```typescript");
  });

  it("should use default version when not specified", () => {
    const content = `---
name: no-version
description: No version specified
---

Body`;

    const result = parseSkillMd(content);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.version).toBeUndefined();
  });
});

describe("loadSkillMdDirectory", () => {
  const testDir = join(__dirname, "test-skill-temp");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("should return null when SKILL.md does not exist", () => {
    const result = loadSkillMdDirectory(testDir);
    expect(result).toBeNull();
  });

  it("should load SKILL.md with valid content", () => {
    const skillMd = `---
name: directory-skill
description: Skill from directory
---

Instructions here`;
    writeFileSync(join(testDir, "SKILL.md"), skillMd);

    const result = loadSkillMdDirectory(testDir);

    expect(result).not.toBeNull();
    expect(result!.frontmatter.name).toBe("directory-skill");
    expect(result!.body).toBe("Instructions here");
  });

  it("should load references from references directory", () => {
    const skillMd = `---
name: refs-skill
description: Has references
---

Body`;
    writeFileSync(join(testDir, "SKILL.md"), skillMd);
    mkdirSync(join(testDir, "references"), { recursive: true });
    writeFileSync(join(testDir, "references", "guide.md"), "# Guide\nContent");

    const result = loadSkillMdDirectory(testDir);

    expect(result).not.toBeNull();
    expect(result!.references.size).toBe(1);
    expect(result!.references.get("guide.md")).toBe("# Guide\nContent");
  });

  it("should ignore non-markdown references and script subdirectories", () => {
    const skillMd = `---
name: mixed-assets-skill
description: Has mixed assets
---

Body`;
    writeFileSync(join(testDir, "SKILL.md"), skillMd);
    mkdirSync(join(testDir, "references"), { recursive: true });
    writeFileSync(join(testDir, "references", "guide.md"), "# Guide\nContent");
    writeFileSync(join(testDir, "references", "notes.txt"), "Ignore");
    mkdirSync(join(testDir, "scripts"), { recursive: true });
    writeFileSync(join(testDir, "scripts", "setup.sh"), "echo setup");
    mkdirSync(join(testDir, "scripts", "nested"), { recursive: true });

    const result = loadSkillMdDirectory(testDir);

    expect(result).not.toBeNull();
    expect([...result!.references.keys()]).toEqual(["guide.md"]);
    expect([...result!.scripts.keys()]).toEqual(["setup.sh"]);
  });

  it("should load scripts from scripts directory", () => {
    const skillMd = `---
name: scripts-skill
description: Has scripts
---

Body`;
    writeFileSync(join(testDir, "SKILL.md"), skillMd);
    mkdirSync(join(testDir, "scripts"), { recursive: true });
    writeFileSync(join(testDir, "scripts", "setup.sh"), "#!/bin/bash\necho setup");

    const result = loadSkillMdDirectory(testDir);

    expect(result).not.toBeNull();
    expect(result!.scripts.size).toBe(1);
    expect(result!.scripts.get("setup.sh")).toBe("#!/bin/bash\necho setup");
  });

  it("should return null for invalid SKILL.md", () => {
    writeFileSync(join(testDir, "SKILL.md"), "No frontmatter here");

    const result = loadSkillMdDirectory(testDir);

    expect(result).toBeNull();
  });
});

describe("SkillRegistry with SKILL.md support", () => {
  const testDir = join(__dirname, "test-registry-temp");
  const skillDir = join(testDir, "test-skill");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(skillDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it("should load SKILL.md-based skill from local directory", () => {
    const skillMd = `---
name: registry-test-skill
description: Skill for registry test
version: "2.0.0"
---

# Instructions
Follow these instructions.`;
    writeFileSync(join(skillDir, "SKILL.md"), skillMd);

    const registry = new SkillRegistry({ localSkillsDir: testDir });
    const skills = registry.listAvailableSync();

    const found = skills.find((s) => s.skill.name === "registry-test-skill");
    expect(found).toBeDefined();
    expect(found!.skill.description).toBe("Skill for registry test");
    expect(found!.skill.version).toBe("2.0.0");
    expect(found!.skill.systemPrompt).toBe("# Instructions\nFollow these instructions.");
    expect(found!.source).toBe("local");
  });

  it("should prefer SKILL.md over package.json", () => {
    const skillMd = `---
name: skillmd-skill
description: From SKILL.md
---

SKILL.md instructions`;
    writeFileSync(join(skillDir, "SKILL.md"), skillMd);
    writeFileSync(
      join(skillDir, "package.json"),
      JSON.stringify({
        name: "package-json-skill",
        description: "From package.json",
        version: "1.0.0",
      })
    );

    const registry = new SkillRegistry({ localSkillsDir: testDir });
    const skills = registry.listAvailableSync();

    const found = skills.find((s) => s.skill.name === "skillmd-skill");
    expect(found).toBeDefined();
    expect(found!.skill.description).toBe("From SKILL.md");
  });

  it("should fall back to package.json when SKILL.md is invalid", () => {
    writeFileSync(join(skillDir, "SKILL.md"), "Invalid frontmatter");
    writeFileSync(
      join(skillDir, "package.json"),
      JSON.stringify({ name: "fallback-skill", description: "Fallback", version: "1.0.0" })
    );

    const registry = new SkillRegistry({ localSkillsDir: testDir });
    const skills = registry.listAvailableSync();

    const found = skills.find((s) => s.skill.name === "fallback-skill");
    expect(found).toBeDefined();
    expect(found!.skill.description).toBe("Fallback");
  });

  it("should include builtin skills alongside SKILL.md skills", () => {
    const skillMd = `---
name: custom-skill
description: Custom skill
---

Body`;
    writeFileSync(join(skillDir, "SKILL.md"), skillMd);

    const registry = new SkillRegistry({ localSkillsDir: testDir });
    const skills = registry.listAvailableSync();

    const builtinCount = skills.filter((s) => s.source === "builtin").length;
    expect(builtinCount).toBeGreaterThan(0);

    const custom = skills.find((s) => s.skill.name === "custom-skill");
    expect(custom).toBeDefined();
  });

  it("should return undefined for missing skills", () => {
    const registry = new SkillRegistry({ localSkillsDir: testDir });

    expect(registry.getSkillSync("missing-skill")).toBeUndefined();
  });

  it("should use package path and defaults when package metadata is partial", () => {
    writeFileSync(join(skillDir, "package.json"), JSON.stringify({}));

    const registry = new SkillRegistry({ localSkillsDir: testDir });
    const found = registry.getSkillSync("test-skill");

    expect(found).toBeDefined();
    expect(found!.skill).toMatchObject({
      name: "test-skill",
      description: "External skill: test-skill",
      version: "0.0.0",
    });
  });

  it("should skip invalid package metadata", () => {
    writeFileSync(join(skillDir, "package.json"), "{bad json");

    const registry = new SkillRegistry({ localSkillsDir: testDir });

    expect(registry.listAvailableSync().some((entry) => entry.path === skillDir)).toBe(false);
  });

  it("should no-op npm removal when local skill directory is absent", async () => {
    rmSync(testDir, { recursive: true, force: true });
    const registry = new SkillRegistry({ localSkillsDir: testDir });

    await expect(registry.removeFromNpm("missing-package", { cwd: testDir })).resolves.toBeUndefined();
  });

  it("should load dependencies from SKILL.md", () => {
    const skillMd = `---
name: skill-with-deps
description: Has dependencies
dependencies: ["base-skill", "core-skill"]
---

Body`;
    writeFileSync(join(skillDir, "SKILL.md"), skillMd);

    const registry = new SkillRegistry({ localSkillsDir: testDir });
    const skills = registry.listAvailableSync();

    const found = skills.find((s) => s.skill.name === "skill-with-deps");
    expect(found).toBeDefined();
    expect(found!.skill.dependencies).toEqual(["base-skill", "core-skill"]);
  });
});
