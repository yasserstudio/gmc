import { createProgram } from "./program.js";

const program = createProgram();

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`gmc: ${message}\n`);
  process.exitCode = 1;
});
