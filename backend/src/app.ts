import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import type { PipelineDeps } from "./pipeline/types.js";
import { createAuthRouter } from "./routes/auth.routes.js";
import { createKitsRouter } from "./routes/kits.routes.js";
import { jobsRouter } from "./routes/jobs.routes.js";
import { csrfOriginCheck } from "./middleware/csrfOriginCheck.js";
import { errorHandler } from "./middleware/errorHandler.js";

export interface AppOptions {
  frontendOrigin: string;
  pipelineDeps: PipelineDeps;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      pipelineDeps: PipelineDeps;
    }
  }
}

/** App factory — no listen() call, so it's importable directly by supertest and by index.ts's bootstrap. */
export function createApp(options: AppOptions): Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: options.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(csrfOriginCheck(options.frontendOrigin));

  app.locals.pipelineDeps = options.pipelineDeps;

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", createAuthRouter());
  app.use("/api/kits", createKitsRouter());
  app.use("/api/jobs", jobsRouter);

  app.use(errorHandler);
  return app;
}
