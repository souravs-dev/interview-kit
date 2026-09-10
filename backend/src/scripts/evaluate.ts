import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CaseInput, CaseOutputFile, type CaseError, type CaseResult, validateKit } from "@interview-prep-kit/shared";
import { buildKit } from "../pipeline/orchestrator.js";
import type { PipelineDeps } from "../pipeline/types.js";
import { createPipelineDeps } from "../adapters/createPipelineDeps.js";
import { LlmJsonError } from "../adapters/completeJson.js";
import { BlockedUrlError } from "../security/ssrfGuard.js";
import { mapWithConcurrency } from "../utils/mapWithConcurrency.js";

/**
 * Bounded to respect free-tier LLM rate limits — each kit already fires
 * several concurrent category calls internally (RFC-001 section 3.2), so
 * running many kits at once compounds quickly. Overridable via --concurrency.
 */
const DEFAULT_CONCURRENCY = 2;

export interface RunEvaluateOptions {
  concurrency?: number;
}

interface PendingCase {
  originalIndex: number;
  case: CaseInput;
}

interface IndexedResult {
  originalIndex: number;
  result: CaseResult;
}

function isRecordWithStringId(value: unknown): value is { id: string } {
  return typeof value === "object" && value !== null && "id" in value && typeof (value as { id: unknown }).id === "string";
}

/**
 * Every malformed row is recorded as its own failed entry (using its `id`
 * field if present, else a synthetic `row-N`) rather than aborting the
 * whole run — Section 9's "continues after one case fails" applies just
 * as much to unparseable input rows as to failures during generation.
 */
function partitionCases(rawCases: unknown[]): { pending: PendingCase[]; invalidResults: IndexedResult[] } {
  const pending: PendingCase[] = [];
  const invalidResults: IndexedResult[] = [];

  rawCases.forEach((raw, originalIndex) => {
    const parsed = CaseInput.safeParse(raw);
    if (parsed.success) {
      pending.push({ originalIndex, case: parsed.data });
      return;
    }
    const id = isRecordWithStringId(raw) ? raw.id : `row-${originalIndex}`;
    invalidResults.push({
      originalIndex,
      result: {
        id,
        status: "failed",
        kit: null,
        error: { code: "INVALID_INPUT", message: parsed.error.issues.map((issue) => issue.message).join("; ") },
      },
    });
  });

  return { pending, invalidResults };
}

function classifyError(error: unknown): CaseError {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof LlmJsonError) return { code: "LLM_FAILURE", message };
  if (error instanceof BlockedUrlError) return { code: "INVALID_INPUT", message };
  return { code: "UNKNOWN", message };
}

/**
 * Runs the exact same pipeline the web app uses (buildKit — no parallel
 * implementation, per Section 9) against one case. "ok" covers any kit
 * that was actually produced, however thin or gap-ridden — "failed" is
 * reserved for a case that could not produce a structurally valid kit at
 * all, per the brief's own FAQ guidance.
 */
async function evaluateCase(caseInput: CaseInput, deps: PipelineDeps): Promise<CaseResult> {
  try {
    const kit = await buildKit({ jd: caseInput.jd, company_url: caseInput.company_url, days: caseInput.days }, deps);
    const validation = validateKit(kit);
    if (!validation.valid) {
      return {
        id: caseInput.id,
        status: "failed",
        kit: null,
        error: {
          code: "VALIDATION_FAILED",
          message: `Generated kit failed structure validation: ${validation.errors.map((e) => e.message).join("; ")}`,
        },
      };
    }
    return { id: caseInput.id, status: "ok", kit, error: null };
  } catch (error) {
    return { id: caseInput.id, status: "failed", kit: null, error: classifyError(error) };
  }
}

/**
 * The testable core of the batch command — takes already-constructed
 * PipelineDeps so tests can inject fakes with zero network/API calls.
 * The CLI entrypoint below is a thin wrapper: parse argv, build real
 * deps from env, call this.
 */
export async function runEvaluate(
  inputPath: string,
  outputPath: string,
  deps: PipelineDeps,
  options: RunEvaluateOptions = {},
): Promise<CaseOutputFile> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const rawText = await readFile(inputPath, "utf-8");
  let rawCases: unknown;
  try {
    rawCases = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Input file is not valid JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(rawCases)) {
    throw new Error(`Input file must contain a JSON array of cases, got ${typeof rawCases}`);
  }

  const { pending, invalidResults } = partitionCases(rawCases);

  const processed = await mapWithConcurrency(pending, concurrency, async (p): Promise<IndexedResult> => ({
    originalIndex: p.originalIndex,
    result: await evaluateCase(p.case, deps),
  }));

  const kits = [...invalidResults, ...processed]
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((r) => r.result);

  const outputFile = {
    version: "1.0" as const,
    generated_at: new Date().toISOString(),
    kits,
  };

  const validated = CaseOutputFile.safeParse(outputFile);
  if (!validated.success) {
    // Should be unreachable given evaluateCase's own validateKit check above —
    // guards against ever writing a file that doesn't match Appendix B.
    throw new Error(`Internal error: assembled output failed its own schema: ${validated.error.message}`);
  }

  await writeFile(outputPath, JSON.stringify(validated.data, null, 2), "utf-8");
  return validated.data;
}

function parseArgs(argv: string[]): { input: string; output: string; concurrency?: number } {
  let input: string | undefined;
  let output: string | undefined;
  let concurrency: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") input = argv[++i];
    else if (argv[i] === "--output") output = argv[++i];
    else if (argv[i] === "--concurrency") concurrency = Number(argv[++i]);
  }

  if (!input || !output) {
    throw new Error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json> [--concurrency <n>]");
  }

  return { input, output, concurrency };
}

/**
 * Loads the repo-root .env into process.env, so `npm run evaluate` works
 * from a clean clone with no setup beyond the documented install step
 * (Section 9). A no-op if the file doesn't exist — real deployments that
 * inject env vars directly (not via a .env file) still work unaffected.
 */
function loadRootEnvFile(): void {
  const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));
  try {
    process.loadEnvFile(envPath);
  } catch {
    // No .env file present — assume env vars are already set some other way.
  }
}

async function main(): Promise<void> {
  loadRootEnvFile();
  const { input, output, concurrency } = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(process.cwd(), input);
  const outputPath = path.resolve(process.cwd(), output);

  const deps = createPipelineDeps(process.env);
  const start = Date.now();

  console.log(`Reading cases from ${inputPath}...`);
  const result = await runEvaluate(inputPath, outputPath, deps, { concurrency });

  const okCount = result.kits.filter((k) => k.status === "ok").length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Wrote ${result.kits.length} result(s) to ${outputPath} (${okCount} ok, ${result.kits.length - okCount} failed) in ${elapsed}s`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error("Fatal error running batch evaluation:", error);
    process.exit(1);
  });
}
