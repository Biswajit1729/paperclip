// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClientProvider, onlineManager, type QueryClient, type UseMutationResult } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createConnectivityStore, type ConnectivityStore } from "@/lib/connectivity";
import { createAppQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/queryKeys";
import { useAccountBoundMutation } from "./useAccountBoundMutation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let store: ConnectivityStore;
let current: UseMutationResult<string, Error, { id: string }>;
const send = vi.fn();
const success = vi.fn();
let waitForTurn: (() => Promise<void>) | undefined;

function Harness({ target = "original" }: { target?: string }) {
  current = useAccountBoundMutation({
    meta: { replay: "idempotent" },
    mutationFn: async (input: { id: string }) => send(target, input),
    onSuccess: success,
    waitForTurn,
  });
  return null;
}

function render(target = "original") {
  act(() => root.render(<QueryClientProvider client={client}><Harness target={target} /></QueryClientProvider>));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  send.mockReset().mockResolvedValue("saved");
  success.mockReset();
  waitForTurn = undefined;
  store = createConnectivityStore({ probe: async () => ({ reachable: true }), browserOnline: true });
  client = createAppQueryClient({ connectivity: store });
  client.setQueryData(queryKeys.auth.session, { user: { id: "account-a" } });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  client.clear();
  store.dispose();
  onlineManager.setOnline(true);
});

it.each(["accept", "reject", "answer"])("does not send a paused %s after account change", async (id) => {
  onlineManager.setOnline(false);
  render();
  let pending!: Promise<unknown>;
  act(() => { pending = current.mutateAsync({ id }).catch(error => error); });
  await act(async () => {});
  expect(send).not.toHaveBeenCalled();
  await act(async () => {
    await client.resetQueries({ queryKey: queryKeys.auth.session });
    client.setQueryData(queryKeys.auth.session, { user: { id: "account-b" } });
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
  });
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(send).not.toHaveBeenCalled();
  expect(success).not.toHaveBeenCalled();
});

it("checks the account after waiting behind another write", async () => {
  let release!: () => void;
  waitForTurn = () => new Promise<void>(resolve => { release = resolve; });
  render();
  let pending!: Promise<unknown>;
  await act(async () => { pending = current.mutateAsync({ id: "queued" }).catch(error => error); });
  await act(async () => {
    client.setQueryData(queryKeys.auth.session, { user: { id: "account-b" } });
    release();
  });
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(send).not.toHaveBeenCalled();
});

it("retains the original target when the mounted surface changes", async () => {
  onlineManager.setOnline(false);
  render("task-a");
  let pending!: Promise<unknown>;
  await act(async () => { pending = current.mutateAsync({ id: "interaction-a" }); });
  render("task-b");
  await act(async () => {
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
  });
  expect(await pending).toBe("saved");
  expect(send).toHaveBeenCalledExactlyOnceWith("task-a", { id: "interaction-a" });
});

it("does not apply an old response to the next account", async () => {
  let resolve!: (result: string) => void;
  send.mockReturnValue(new Promise<string>(done => { resolve = done; }));
  render();
  let pending!: Promise<unknown>;
  await act(async () => { pending = current.mutateAsync({ id: "in-flight" }).catch(error => error); });
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => {
    client.setQueryData(queryKeys.auth.session, { user: { id: "account-b" } });
    resolve("saved for account-a");
  });
  expect(await pending).toMatchObject({ name: "AbortError" });
  expect(success).not.toHaveBeenCalled();
});
