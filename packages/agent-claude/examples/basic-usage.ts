/**
 * Basic Usage Example for @obora/agent-claude
 */

import { ClaudeAgentProvider } from "@obora/agent-claude";
import { executeWorkflow } from "@obora/workflow-core";

async function main() {
  // 1. Create provider instance
  const provider = new ClaudeAgentProvider({
    maxTurns: 10,
    settingSources: ["project"],
  });

  // 2. Execute workflow
  const { plan, results } = await executeWorkflow(
    "Implement user authentication feature",
    process.cwd(),
    provider,
    {
      onPlanComplete: (plan) => {
        console.log("=== Workflow Plan ===");
        console.log("Analysis:", plan.analysis);
        console.log("Steps:", plan.workflow.length);
        console.log();
      },
      onStepStart: (step, index) => {
        console.log(`[Step ${index + 1}] Starting: ${step.agent}`);
        console.log(`Task: ${step.task}`);
      },
      onStepComplete: (step, result, index) => {
        console.log(`[Step ${index + 1}] Completed: ${step.agent}`);
        console.log(`Success: ${result.success}`);
        if (result.error) {
          console.error(`Error: ${result.error}`);
        }
        console.log();
      },
    }
  );

  // 3. Print summary
  console.log("=== Execution Summary ===");
  console.log(`Total steps: ${results.length}`);
  console.log(
    `Successful: ${results.filter((r) => r.success).length}`
  );
  console.log(`Failed: ${results.filter((r) => !r.success).length}`);
}

main().catch(console.error);
