import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  entries: ["src/index", { input: "src/cli", name: "obora" }],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
});
