import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  LoyaltyCustomersService,
  type LoyaltyCustomerAddress,
  type LoyaltyCustomer,
  type LoyaltyTier,
  type ManageLoyaltyCustomerMatchRequest,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, readJsonObject, resolveAccount } from "./_shared.js";

const LOYALTY_TIERS = new Set<LoyaltyTier>([
  "TIER1",
  "TIER2",
  "TIER3",
  "TIER4",
  "TIER5",
  "TIER6",
  "TIER7",
  "NON_MEMBER",
]);

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAddressIdentifier(address: LoyaltyCustomerAddress | undefined): boolean {
  return Boolean(address && Object.values(address).some(hasText));
}

/** Validate the privacy-sensitive request locally without printing its identifiers. */
async function readManageRequest(
  file: string | undefined,
): Promise<ManageLoyaltyCustomerMatchRequest> {
  const input = await readJsonObject(file, "loyalty customer");
  const customer = ("loyaltyCustomer" in input ? input["loyaltyCustomer"] : input) as
    LoyaltyCustomer | undefined;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    throw new UsageError(
      "The loyalty customer body is invalid.",
      "Provide a LoyaltyCustomer object, optionally wrapped in { loyaltyCustomer: ... }.",
    );
  }
  const identifier = customer.userIdentifier;
  const hasIdentifier = Boolean(
    identifier &&
    (hasText(identifier.emailAddress) ||
      hasText(identifier.phoneNumber) ||
      hasAddressIdentifier(identifier.address)),
  );
  if (!hasIdentifier) {
    throw new UsageError(
      "A loyalty customer identifier is required.",
      "Set userIdentifier.emailAddress, phoneNumber, or a non-empty address.",
    );
  }
  if (!customer.loyaltyTier || !LOYALTY_TIERS.has(customer.loyaltyTier)) {
    throw new UsageError(
      "A valid loyalty tier is required.",
      "Use TIER1 through TIER7, or NON_MEMBER to remove the association.",
    );
  }
  if (customer.pointBalance !== undefined && !/^-?\d+$/.test(customer.pointBalance)) {
    throw new UsageError(
      "pointBalance must be an integer string.",
      'Use a JSON string such as "750".',
    );
  }
  return { loyaltyCustomer: customer };
}

/** Register the privacy-preserving Loyalty Customers GA manage operation. */
export function registerLoyaltyCustomerCommands(program: Command): void {
  const loyalty = program
    .command("loyalty-customers")
    .alias("loyalty")
    .description("Manage customer loyalty-tier associations (write-only)");

  loyalty
    .command("manage")
    .option("--file <path>", "Read LoyaltyCustomer JSON from this file (else stdin)")
    .description("Upsert a tier, or remove an association with NON_MEMBER")
    .action(async (opts: { file?: string }) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const request = await readManageRequest(opts.file);
        const service = new LoyaltyCustomersService(await clientFor(ctx, account));
        const result = await service.manage(request);
        if (ctx.json) emitJson(result);
        else {
          process.stdout.write("Loyalty customer association request accepted.\n");
          process.stdout.write(
            "Google intentionally does not confirm whether the identifier matched a customer.\n",
          );
        }
      } catch (err) {
        reportError(err, { json }, "gmc loyalty-customers manage");
      }
    });
}
