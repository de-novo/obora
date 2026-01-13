/**
 * Fastify REST API Routes
 *
 * Provides REST endpoints for agent activity dashboard
 */

import type { FastifyPluginAsync } from "fastify";
import {
  getSessions,
  getWorkflows,
  getWorkflowSteps,
  getAgentRuns,
  getToolCalls,
  getFileAccesses,
  getAgentStats,
  getWorkflowProgress,
  getCurrentActivity,
  getRecentActions,
  getAgentRelationships,
  getWorkflowFlow,
  getParallelGroups,
  getFeedbackLoops,
  getFeedbackLoopWithIterations,
  getCurrentFeedbackLoop,
  getAgentRunBranches,
  getWorkflowProgressExtended,
  type AgentRunFilters,
} from "../db/index";

/**
 * Standard API response format
 */
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Query parameters for GET /api/workflows
 */
interface WorkflowsQueryParams {
  sessionId?: string;
}

/**
 * Query parameters for GET /api/agent-runs
 */
interface AgentRunsQueryParams {
  sessionId?: string;
  workflowId?: string;
  agentName?: string;
  status?: string;
}

/**
 * Query parameters for GET /api/file-accesses
 */
interface FileAccessesQueryParams {
  runId?: string;
}

/**
 * Query parameters for GET /api/actions/recent
 */
interface RecentActionsQueryParams {
  limit?: string;
}

/**
 * Query parameters for GET /api/agent-relationships
 */
interface AgentRelationshipsQueryParams {
  sessionId?: string;
}

/**
 * Query parameters for GET /api/workflow-flow
 */
interface WorkflowFlowQueryParams {
  sessionId: string;
}

/**
 * Route parameters for workflow/run IDs
 */
interface IdParams {
  id: string;
}

/**
 * Query parameters for GET /api/parallel-groups
 */
interface ParallelGroupsQueryParams {
  workflowId: string;
}

/**
 * Query parameters for GET /api/feedback-loops
 */
interface FeedbackLoopsQueryParams {
  workflowId?: string;
}

/**
 * Route parameters for feedback loop ID
 */
interface LoopIdParams {
  id: string;
}

/**
 * Fastify plugin for API routes
 */
export const apiRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/sessions
   * Returns all sessions ordered by most recent first
   */
  fastify.get("/api/sessions", async (request, reply) => {
    try {
      const sessions = getSessions();
      const response: ApiResponse<typeof sessions> = {
        ok: true,
        data: sessions,
      };
      return reply.send(response);
    } catch (error) {
      const response: ApiResponse<never> = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return reply.status(500).send(response);
    }
  });

  /**
   * GET /api/workflows
   * Returns workflows, optionally filtered by sessionId
   */
  fastify.get<{
    Querystring: WorkflowsQueryParams;
  }>(
    "/api/workflows",
    async (request, reply) => {
      try {
        const { sessionId } = request.query;
        const workflows = getWorkflows(sessionId);
        const response: ApiResponse<typeof workflows> = {
          ok: true,
          data: workflows,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/workflows/:id/steps
   * Returns steps for a specific workflow
   */
  fastify.get<{
    Params: IdParams;
  }>(
    "/api/workflows/:id/steps",
    async (request, reply) => {
      try {
        const { id } = request.params;
        const steps = getWorkflowSteps(id);
        const response: ApiResponse<typeof steps> = {
          ok: true,
          data: steps,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/agent-runs
   * Returns agent runs with optional filters
   */
  fastify.get<{
    Querystring: AgentRunsQueryParams;
  }>(
    "/api/agent-runs",
    async (request, reply) => {
      try {
        const filters: AgentRunFilters = {
          sessionId: request.query.sessionId,
          workflowId: request.query.workflowId,
          agentName: request.query.agentName,
          status: request.query.status,
        };

        const runs = getAgentRuns(filters);
        const response: ApiResponse<typeof runs> = {
          ok: true,
          data: runs,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/agent-runs/:id/tools
   * Returns tool calls for a specific agent run
   */
  fastify.get<{
    Params: IdParams;
  }>(
    "/api/agent-runs/:id/tools",
    async (request, reply) => {
      try {
        const { id } = request.params;
        const tools = getToolCalls(id);
        const response: ApiResponse<typeof tools> = {
          ok: true,
          data: tools,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/file-accesses
   * Returns file accesses, optionally filtered by runId
   */
  fastify.get<{
    Querystring: FileAccessesQueryParams;
  }>(
    "/api/file-accesses",
    async (request, reply) => {
      try {
        const { runId } = request.query;
        const fileAccesses = getFileAccesses(runId);
        const response: ApiResponse<typeof fileAccesses> = {
          ok: true,
          data: fileAccesses,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/stats/agents
   * Returns aggregated statistics per agent
   */
  fastify.get("/api/stats/agents", async (request, reply) => {
    try {
      const stats = getAgentStats();
      const response: ApiResponse<typeof stats> = {
        ok: true,
        data: stats,
      };
      return reply.send(response);
    } catch (error) {
      const response: ApiResponse<never> = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return reply.status(500).send(response);
    }
  });

  /**
   * GET /api/workflows/:id/progress
   * Returns progress information for a specific workflow
   */
  fastify.get<{
    Params: IdParams;
  }>(
    "/api/workflows/:id/progress",
    async (request, reply) => {
      try {
        const { id } = request.params;
        const progress = getWorkflowProgress(id);

        if (!progress) {
          const response: ApiResponse<never> = {
            ok: false,
            error: "Workflow not found",
          };
          return reply.status(404).send(response);
        }

        const response: ApiResponse<typeof progress> = {
          ok: true,
          data: progress,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/activity/current
   * Returns currently running activities
   */
  fastify.get("/api/activity/current", async (request, reply) => {
    try {
      const activity = getCurrentActivity();
      const response: ApiResponse<typeof activity> = {
        ok: true,
        data: activity,
      };
      return reply.send(response);
    } catch (error) {
      const response: ApiResponse<never> = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return reply.status(500).send(response);
    }
  });

  /**
   * GET /api/actions/recent
   * Returns recent actions across all types
   */
  fastify.get<{
    Querystring: RecentActionsQueryParams;
  }>(
    "/api/actions/recent",
    async (request, reply) => {
      try {
        const limit = request.query.limit
          ? parseInt(request.query.limit, 10)
          : 100;

        const actions = getRecentActions(limit);
        const response: ApiResponse<typeof actions> = {
          ok: true,
          data: actions,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/agent-relationships
   * Returns agent hierarchy (parent-child relationships)
   */
  fastify.get<{
    Querystring: AgentRelationshipsQueryParams;
  }>(
    "/api/agent-relationships",
    async (request, reply) => {
      try {
        const { sessionId } = request.query;
        const relationships = getAgentRelationships(sessionId);
        const response: ApiResponse<typeof relationships> = {
          ok: true,
          data: relationships,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/workflow-flow
   * Returns workflow flow data with Mermaid diagram syntax
   */
  fastify.get<{
    Querystring: WorkflowFlowQueryParams;
  }>(
    "/api/workflow-flow",
    async (request, reply) => {
      try {
        const { sessionId } = request.query;

        if (!sessionId) {
          const response: ApiResponse<never> = {
            ok: false,
            error: "sessionId is required",
          };
          return reply.status(400).send(response);
        }

        const flow = getWorkflowFlow(sessionId);

        if (!flow) {
          const response: ApiResponse<never> = {
            ok: false,
            error: "No workflow data found for this session",
          };
          return reply.status(404).send(response);
        }

        const response: ApiResponse<typeof flow> = {
          ok: true,
          data: flow,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/parallel-groups
   * Returns parallel groups for a workflow
   */
  fastify.get<{
    Querystring: ParallelGroupsQueryParams;
  }>(
    "/api/parallel-groups",
    async (request, reply) => {
      try {
        const { workflowId } = request.query;

        if (!workflowId) {
          const response: ApiResponse<never> = {
            ok: false,
            error: "workflowId is required",
          };
          return reply.status(400).send(response);
        }

        const groups = getParallelGroups(workflowId);
        const response: ApiResponse<typeof groups> = {
          ok: true,
          data: groups,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/feedback-loops
   * Returns feedback loops for a workflow
   */
  fastify.get<{
    Querystring: FeedbackLoopsQueryParams;
  }>(
    "/api/feedback-loops",
    async (request, reply) => {
      try {
        const { workflowId } = request.query;

        if (!workflowId) {
          const response: ApiResponse<never> = {
            ok: false,
            error: "workflowId is required",
          };
          return reply.status(400).send(response);
        }

        const loops = getFeedbackLoops(workflowId);
        const response: ApiResponse<typeof loops> = {
          ok: true,
          data: loops,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/feedback-loops/:id
   * Returns feedback loop with iterations
   */
  fastify.get<{
    Params: LoopIdParams;
  }>(
    "/api/feedback-loops/:id",
    async (request, reply) => {
      try {
        const { id } = request.params;
        const loopId = parseInt(id, 10);

        if (isNaN(loopId)) {
          const response: ApiResponse<never> = {
            ok: false,
            error: "Invalid loop ID",
          };
          return reply.status(400).send(response);
        }

        const loop = getFeedbackLoopWithIterations(loopId);

        if (!loop) {
          const response: ApiResponse<never> = {
            ok: false,
            error: "Feedback loop not found",
          };
          return reply.status(404).send(response);
        }

        const response: ApiResponse<typeof loop> = {
          ok: true,
          data: loop,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/feedback-loops/current
   * Returns currently active feedback loop
   */
  fastify.get("/api/feedback-loops/current", async (request, reply) => {
    try {
      const loop = getCurrentFeedbackLoop();

      if (!loop) {
        const response: ApiResponse<never> = {
          ok: false,
          error: "No active feedback loop",
        };
        return reply.status(404).send(response);
      }

      const response: ApiResponse<typeof loop> = {
        ok: true,
        data: loop,
      };
      return reply.send(response);
    } catch (error) {
      const response: ApiResponse<never> = {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      return reply.status(500).send(response);
    }
  });

  /**
   * GET /api/workflows/:id/progress-extended
   * Returns workflow progress with parallel groups and feedback loops
   */
  fastify.get<{
    Params: IdParams;
  }>(
    "/api/workflows/:id/progress-extended",
    async (request, reply) => {
      try {
        const { id } = request.params;
        const progress = getWorkflowProgressExtended(id);

        if (!progress) {
          const response: ApiResponse<never> = {
            ok: false,
            error: "Workflow not found",
          };
          return reply.status(404).send(response);
        }

        const response: ApiResponse<typeof progress> = {
          ok: true,
          data: progress,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );

  /**
   * GET /api/workflows/:id/branches
   * Returns agent run branches for a workflow
   */
  fastify.get<{
    Params: IdParams;
  }>(
    "/api/workflows/:id/branches",
    async (request, reply) => {
      try {
        const { id } = request.params;
        const branches = getAgentRunBranches(id);

        const response: ApiResponse<typeof branches> = {
          ok: true,
          data: branches,
        };
        return reply.send(response);
      } catch (error) {
        const response: ApiResponse<never> = {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        return reply.status(500).send(response);
      }
    }
  );
};
