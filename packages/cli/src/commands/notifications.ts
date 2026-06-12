import type { Command } from "commander";
import { emitJson, reportError, UsageError } from "@gmc-cli/core";
import {
  NotificationsService,
  notificationSegment,
  type NotificationSubscription,
  type NotificationSubscriptionInput,
  type RegisteredEvent,
} from "@gmc-cli/api";
import { contextFrom, wantsJson } from "../context.js";
import { clientFor, resolveAccount, line } from "./_shared.js";

/** The events a subscription can register for (the API currently exposes one). */
const REGISTERED_EVENTS: readonly RegisteredEvent[] = ["PRODUCT_STATUS_CHANGE"];

interface NotificationWriteOpts {
  callbackUri?: string;
  event?: string;
  allManagedAccounts?: boolean;
  targetAccount?: string;
  updateMask?: string;
}

/** True for an `https://` URL (webhooks must be HTTPS). */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** Parse `--event` into a RegisteredEvent (accepts `product-status-change`), or throw. */
function parseEvent(raw: string): RegisteredEvent {
  const event = raw.toUpperCase().replace(/-/g, "_");
  if (!(REGISTERED_EVENTS as readonly string[]).includes(event)) {
    throw new UsageError(
      `Invalid --event "${raw}".`,
      `Use one of: ${REGISTERED_EVENTS.join(", ")}.`,
    );
  }
  return event as RegisteredEvent;
}

/**
 * Build a NotificationSubscriptionInput from the flags. On create, the callback and a
 * target (all-managed XOR a specific account) are required and the event defaults to
 * `PRODUCT_STATUS_CHANGE`; on update everything is optional (but at least one field).
 */
function buildNotificationInput(
  opts: NotificationWriteOpts,
  forCreate: boolean,
): NotificationSubscriptionInput {
  const input: NotificationSubscriptionInput = {};

  if (opts.event !== undefined) input.registeredEvent = parseEvent(opts.event);
  else if (forCreate) input.registeredEvent = "PRODUCT_STATUS_CHANGE";

  if (opts.callbackUri !== undefined) {
    if (!isHttpsUrl(opts.callbackUri)) {
      throw new UsageError(`Invalid --callback-uri "${opts.callbackUri}".`, "Use an https:// URL.");
    }
    input.callBackUri = opts.callbackUri;
  } else if (forCreate) {
    throw new UsageError(
      "--callback-uri is required.",
      "Pass the https webhook URL that will receive notifications.",
    );
  }

  if (opts.allManagedAccounts && opts.targetAccount !== undefined) {
    throw new UsageError(
      "Pass either --all-managed-accounts or --target-account, not both.",
      "A subscription targets all managed accounts or a single account.",
    );
  }
  if (opts.allManagedAccounts) input.allManagedAccounts = true;
  if (opts.targetAccount !== undefined) {
    if (!/^\d+$/.test(opts.targetAccount)) {
      throw new UsageError(
        `Invalid --target-account "${opts.targetAccount}".`,
        "Account ids are numeric, e.g. 123456789.",
      );
    }
    input.targetAccount = `accounts/${opts.targetAccount}`;
  }
  if (forCreate && !opts.allManagedAccounts && opts.targetAccount === undefined) {
    throw new UsageError(
      "A subscription needs a target.",
      "Pass --all-managed-accounts or --target-account <id>.",
    );
  }

  if (!forCreate && Object.keys(input).length === 0) {
    throw new UsageError(
      "Nothing to update.",
      "Pass --callback-uri, --event, --all-managed-accounts, or --target-account.",
    );
  }
  return input;
}

/**
 * Derive the `updateMask` for an update. Normally it is the input's own keys; but when an
 * update switches the target union (sets `--all-managed-accounts` or `--target-account`), both
 * union fields are named so the *other* side is cleared — a field named in the mask but absent
 * from the body is deleted, so the two union fields can't both end up set.
 */
function unionAwareMask(opts: NotificationWriteOpts, input: NotificationSubscriptionInput): string {
  const fields = new Set(Object.keys(input));
  if (opts.allManagedAccounts || opts.targetAccount !== undefined) {
    fields.add("allManagedAccounts");
    fields.add("targetAccount");
  }
  return [...fields].join(",");
}

/** The bare subscription id, preferring the resource `name` segment. */
function notificationIdOf(sub: NotificationSubscription): string {
  return sub.name ? notificationSegment(sub.name) : "—";
}

/** One-line target summary: all managed accounts, or the specific target account. */
function targetSummary(sub: NotificationSubscription): string {
  if (sub.allManagedAccounts) return "all-managed";
  return sub.targetAccount ?? "—";
}

function renderNotifications(subs: NotificationSubscription[]): void {
  if (subs.length === 0) {
    process.stdout.write("No notification subscriptions for this account.\n");
    return;
  }
  const width = Math.max(...subs.map((s) => notificationIdOf(s).length));
  process.stdout.write(`${subs.length} subscription(s):\n`);
  for (const s of subs) {
    const event = s.registeredEvent ?? "—";
    process.stdout.write(
      `  ${notificationIdOf(s).padEnd(width)}  ${event} · ${targetSummary(s)} · ${s.callBackUri ?? "—"}\n`,
    );
  }
}

function renderNotification(sub: NotificationSubscription): void {
  line("ID", notificationIdOf(sub));
  if (sub.registeredEvent) line("Event", sub.registeredEvent);
  line("Target", targetSummary(sub));
  if (sub.callBackUri) line("Callback", sub.callBackUri);
}

/** Register the `gmc notifications` command group (list / get / create / update / delete). */
export function registerNotificationsCommands(program: Command): void {
  const notifications = program
    .command("notifications")
    .description("Manage webhook notification subscriptions (product-status change events)");

  notifications
    .command("list")
    .description("List notification subscriptions for the account")
    .action(async () => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new NotificationsService(await clientFor(ctx, account));
        const list = await service.listNotifications();
        if (ctx.json) emitJson({ notifications: list });
        else renderNotifications(list);
      } catch (err) {
        reportError(err, { json }, "gmc notifications list");
      }
    });

  notifications
    .command("get")
    .argument("<id>", "Subscription id or resource name (from `notifications list`)")
    .description("Fetch one notification subscription")
    .action(async (id: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new NotificationsService(await clientFor(ctx, account));
        const result = await service.getNotification(id);
        if (ctx.json) emitJson(result);
        else renderNotification(result);
      } catch (err) {
        reportError(err, { json }, "gmc notifications get");
      }
    });

  notifications
    .command("create")
    .option("--callback-uri <url>", "HTTPS webhook URL that receives notifications (required)")
    .option("--event <type>", `Event to register for (default ${REGISTERED_EVENTS[0]})`)
    .option("--all-managed-accounts", "Subscribe for every managed account")
    .option("--target-account <id>", "Subscribe for a single account id")
    .description("Create a notification subscription (its id is auto-generated)")
    .action(async (opts: NotificationWriteOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = buildNotificationInput(opts, true);
        const service = new NotificationsService(await clientFor(ctx, account));
        const result = await service.createNotification(input);
        if (ctx.json) emitJson(result);
        else
          process.stdout.write(`Created notification subscription ${notificationIdOf(result)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc notifications create");
      }
    });

  notifications
    .command("update")
    .argument("<id>", "Subscription id or resource name")
    .option("--callback-uri <url>", "New HTTPS webhook URL")
    .option("--event <type>", "New event to register for")
    .option("--all-managed-accounts", "Subscribe for every managed account")
    .option("--target-account <id>", "Subscribe for a single account id")
    .option("--update-mask <fields>", "Explicit field mask (defaults to the fields you pass)")
    .description("Patch a notification subscription (only the fields you pass are changed)")
    .action(async (id: string, opts: NotificationWriteOpts) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const input = buildNotificationInput(opts, false);
        const service = new NotificationsService(await clientFor(ctx, account));
        const result = await service.updateNotification(id, input, {
          updateMask: opts.updateMask ?? unionAwareMask(opts, input),
        });
        if (ctx.json) emitJson(result);
        else
          process.stdout.write(`Updated notification subscription ${notificationSegment(id)}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc notifications update");
      }
    });

  notifications
    .command("delete")
    .argument("<id>", "Subscription id or resource name")
    .description("Delete a notification subscription")
    .action(async (id: string) => {
      const json = wantsJson(program);
      try {
        const ctx = contextFrom(program);
        const account = resolveAccount(undefined, ctx);
        const service = new NotificationsService(await clientFor(ctx, account));
        await service.deleteNotification(id);
        const seg = notificationSegment(id);
        if (ctx.json) emitJson({ deleted: seg });
        else process.stdout.write(`Deleted notification subscription ${seg}.\n`);
      } catch (err) {
        reportError(err, { json }, "gmc notifications delete");
      }
    });
}
