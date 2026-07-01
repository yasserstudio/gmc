import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  OrderTrackingService,
  type OrderTrackingSignal,
  type OrderTrackingSignalInput,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, line, readJsonObject, pick } from "./_shared.js";

// The writable top-level keys of an OrderTrackingSignal — everything except the
// output-only `orderTrackingSignalId`. A body saved from a create response can be
// re-submitted as-is: the id is dropped here so the API doesn't reject it.
const SIGNAL_FIELDS = [
  "merchantId",
  "orderCreatedTime",
  "orderId",
  "shippingInfo",
  "lineItems",
  "shipmentLineItemMapping",
  "customerShippingFee",
  "deliveryPostalCode",
  "deliveryRegionCode",
] as const satisfies readonly (keyof OrderTrackingSignalInput)[];

interface CreateOpts {
  file?: string;
  merchantId?: string;
}

/**
 * Read an OrderTrackingSignal body from `--file` (or stdin), keep only the writable
 * keys, and validate the three fields the API requires (orderId, shippingInfo,
 * lineItems) up front so a malformed signal fails offline with a clear message
 * rather than an opaque 400.
 */
async function buildSignal(opts: CreateOpts): Promise<OrderTrackingSignalInput> {
  const input = pick<OrderTrackingSignalInput>(
    await readJsonObject(opts.file, "order tracking signal"),
    SIGNAL_FIELDS,
  );
  // `--merchant-id` overrides the body's merchantId (used to submit on behalf of
  // another business, which requires access). Left unset, Google uses the caller's id.
  if (opts.merchantId !== undefined) input.merchantId = opts.merchantId;

  // Validate the required fields by shape, not just presence: orderId must be a
  // non-blank string, and shippingInfo / lineItems must be non-empty arrays. This
  // catches the common mistakes (an object where an array belongs, a blank id)
  // offline rather than letting them reach the API as an opaque 400.
  const missing = (["orderId", "shippingInfo", "lineItems"] as const).filter((k) => {
    const v = input[k];
    if (k === "orderId") return typeof v !== "string" || v.trim() === "";
    return !Array.isArray(v) || v.length === 0;
  });
  if (missing.length > 0) {
    throw new UsageError(
      `The order tracking signal has missing or invalid required field(s): ${missing.join(", ")}.`,
      "A signal needs a non-empty orderId string, a non-empty shippingInfo array, and a non-empty lineItems array.",
    );
  }
  return input;
}

/**
 * One-line summary of a created signal: shipment / line-item counts. The response's
 * orderId is hashed by Google, so it isn't echoed here (it would be a meaningless
 * digest, not the submitted id); the signal's own id is printed on the line above.
 */
function signalSummary(signal: OrderTrackingSignal): string {
  const shipments = signal.shippingInfo?.length ?? 0;
  const items = signal.lineItems?.length ?? 0;
  return `${shipments} shipment(s) · ${items} line item(s)`;
}

/** Register the `gmc ordertracking` command group (create-only sub-API). */
export function registerOrderTrackingCommands(program: Command): void {
  const ordertracking = program
    .command("ordertracking")
    .description("Submit order tracking signals (shipment data for delivery estimates)");

  ordertracking
    .command("create")
    .option("--file <path>", "Read the OrderTrackingSignal JSON from this file (else stdin)")
    .option(
      "--merchant-id <id>",
      "Merchant Center id to attribute the signal to (defaults to the account)",
    )
    .description(
      "Create an order tracking signal (write-only — signals cannot be updated or deleted)",
    )
    .action(async (opts: CreateOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const signal = await buildSignal(opts);
        const service = new OrderTrackingService(await clientFor(ctx, account));
        const result = await service.createOrderTrackingSignal(signal);
        if (ctx.json) emitJson(result);
        else {
          process.stdout.write(
            `Created order tracking signal ${result.orderTrackingSignalId ?? "—"}.\n`,
          );
          line("Signal", signalSummary(result));
        }
      } catch (err) {
        reportError(err, { json }, "gmc ordertracking create");
      }
    });
}
