import { router, publicProcedure } from "../init";

export const appRouter = router({
  healthcheck: publicProcedure.query(() => {
    return { status: "ok" };
  }),
});

export type AppRouter = typeof appRouter;
