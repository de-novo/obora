import "server-only";

import { createCallerFactory, createTRPCContext } from "./init";
import { appRouter } from "./routers";

const createCaller = createCallerFactory(appRouter);

export const api = createCaller(createTRPCContext);
