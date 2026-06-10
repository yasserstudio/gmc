import type { Command } from "commander";
import { emitJson, reportError } from "@gmc-cli/core";
import { getConfigDir, getUserConfigPath, loadConfig } from "@gmc-cli/config";
import { contextFrom, wantsJson } from "../context.js";

/** Register the `gmc config` command group (read-only inspection). */
export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Inspect gmc configuration and profiles");

  config
    .command("path")
    .description("Print the config directory and file paths")
    .action(() => {
      const paths = { configDir: getConfigDir(), configFile: getUserConfigPath() };
      if (wantsJson(program)) {
        emitJson(paths);
      } else {
        process.stdout.write(`config dir:  ${paths.configDir}\nconfig file: ${paths.configFile}\n`);
      }
    });

  config
    .command("list")
    .description("List configured profiles")
    .action(() => {
      const json = wantsJson(program);
      try {
        const cfg = loadConfig();
        const profiles = cfg.profiles ?? {};
        const names = Object.keys(profiles);
        const defaultProfile = cfg.defaultProfile ?? null;

        if (json) {
          emitJson({
            defaultProfile,
            profiles: names.map((name) => ({
              name,
              accountId: profiles[name]?.accountId ?? null,
              default: name === defaultProfile,
            })),
          });
          return;
        }

        if (names.length === 0) {
          process.stdout.write(`No profiles configured.\nEdit ${getUserConfigPath()} to add one.\n`);
          return;
        }
        for (const name of names) {
          const entry = profiles[name];
          const marker = name === defaultProfile ? " (default)" : "";
          const account = entry?.accountId ? `  account ${entry.accountId}` : "";
          process.stdout.write(`${name}${marker}${account}\n`);
        }
      } catch (err) {
        reportError(err, { json }, "gmc config list");
      }
    });

  config
    .command("current")
    .description("Show the profile resolved for this invocation")
    .action(() => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        if (json) {
          emitJson({ profile: ctx.profile, accountId: ctx.accountId ?? null });
        } else {
          const account = ctx.accountId ? `\naccount: ${ctx.accountId}` : "";
          process.stdout.write(`profile: ${ctx.profile}${account}\n`);
        }
      } catch (err) {
        reportError(err, { json }, "gmc config current");
      }
    });
}
