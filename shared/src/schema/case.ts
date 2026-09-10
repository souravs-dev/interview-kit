import { z } from "zod";
import { KitSchema } from "./kit.js";

/** Appendix B — one entry in the batch input file. */
export const CaseInput = z.object({
  id: z.string(),
  jd: z.string(),
  company_url: z.string(),
  days: z.number().int().positive(),
});
export type CaseInput = z.infer<typeof CaseInput>;

export const CaseInputFile = z.array(CaseInput);
export type CaseInputFile = z.infer<typeof CaseInputFile>;

export const CaseErrorCode = z.enum([
  "COMPANY_UNREACHABLE",
  "INVALID_INPUT",
  "LLM_FAILURE",
  "VALIDATION_FAILED",
  "UNKNOWN",
]);
export type CaseErrorCode = z.infer<typeof CaseErrorCode>;

export const CaseError = z.object({
  code: CaseErrorCode,
  message: z.string(),
});
export type CaseError = z.infer<typeof CaseError>;

/** Appendix B — one entry in the batch output file's `kits` array. */
export const CaseResult = z.discriminatedUnion("status", [
  z.object({
    id: z.string(),
    status: z.literal("ok"),
    kit: KitSchema,
    error: z.null(),
  }),
  z.object({
    id: z.string(),
    status: z.literal("failed"),
    kit: z.null(),
    error: CaseError,
  }),
]);
export type CaseResult = z.infer<typeof CaseResult>;

/** Appendix B — the exact shape the batch command writes. */
export const CaseOutputFile = z.object({
  version: z.literal("1.0"),
  generated_at: z.string(),
  kits: z.array(CaseResult),
});
export type CaseOutputFile = z.infer<typeof CaseOutputFile>;
