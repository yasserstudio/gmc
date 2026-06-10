import { describe, it, expect } from "vitest";
import { planProfileMigration, type ConfigView } from "../src/index.js";

describe("planProfileMigration", () => {
  it("plans a create when the profile does not exist", () => {
    const plan = planProfileMigration({ merchantId: "1", profileName: "store", existing: {} });
    expect(plan).toMatchObject({
      profileName: "store",
      accountId: "1",
      action: "create",
      conflict: false,
      setsDefault: false,
    });
    expect(plan.previousAccountId).toBeUndefined();
  });

  it("is a no-op when the profile already targets the same account", () => {
    const existing: ConfigView = { profiles: { store: { accountId: "1" } } };
    expect(planProfileMigration({ merchantId: "1", profileName: "store", existing })).toMatchObject(
      {
        action: "noop",
        conflict: false,
      },
    );
  });

  it("flags a conflict when the profile targets a different account", () => {
    const existing: ConfigView = { profiles: { store: { accountId: "999" } } };
    const plan = planProfileMigration({ merchantId: "1", profileName: "store", existing });
    expect(plan).toMatchObject({ action: "update", conflict: true, previousAccountId: "999" });
  });

  it("updates without conflict when the existing profile has no account", () => {
    const existing: ConfigView = { profiles: { store: {} } };
    const plan = planProfileMigration({ merchantId: "1", profileName: "store", existing });
    expect(plan).toMatchObject({ action: "update", conflict: false });
    expect(plan.previousAccountId).toBeUndefined();
  });

  it("sets default when requested and the default differs", () => {
    const existing: ConfigView = { defaultProfile: "other" };
    const plan = planProfileMigration({
      merchantId: "1",
      profileName: "store",
      existing,
      setDefault: true,
    });
    expect(plan).toMatchObject({ setsDefault: true, previousDefault: "other" });
  });

  it("does not re-set default when this profile is already default", () => {
    const existing: ConfigView = {
      defaultProfile: "store",
      profiles: { store: { accountId: "1" } },
    };
    const plan = planProfileMigration({
      merchantId: "1",
      profileName: "store",
      existing,
      setDefault: true,
    });
    expect(plan.setsDefault).toBe(false);
  });
});
