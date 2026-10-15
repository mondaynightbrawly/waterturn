// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "./Editor";
import { demo } from "./demo";
afterEach(cleanup);
it("applies duration suggestions only after explicit user acceptance", async () => {
  const data = demo();
  const plan = data.sessions.find(
    (s) => s.setId === "s01" && s.status === "planned",
  )!;
  const original = plan.target;
  const user = userEvent.setup();
  render(
    <Editor
      data={data}
      modal={{ type: "edit", id: plan.id }}
      busy={false}
      onSave={vi.fn()}
      onError={vi.fn()}
    />,
  );
  const duration = screen.getByRole("spinbutton", {
    name: "Target duration (minutes)",
  });
  expect((duration as HTMLInputElement).value).toBe(String(original));
  await user.click(screen.getByRole("button", { name: "Use suggestion" }));
  expect((duration as HTMLInputElement).value).toBe("330");
  expect(plan.target).toBe(original);
});
it("keeps the form open and displays errors when persistence fails", async () => {
  const data = demo();
  const onSave = vi.fn().mockRejectedValue(new Error("Storage unavailable"));
  const onError = vi.fn();
  const user = userEvent.setup();
  render(
    <Editor
      data={data}
      modal={{ type: "source", id: "canal" }}
      busy={false}
      onSave={onSave}
      onError={onError}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("alert").textContent).toContain(
    "Storage unavailable",
  );
  expect(onError).toHaveBeenCalledWith("Storage unavailable");
  expect(data.sources[0].name).toBe("Main Canal");
});
