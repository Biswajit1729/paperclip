// @vitest-environment jsdom
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionItem } from "@paperclipai/shared";
import { createIssue } from "../../storybook/fixtures/paperclipData";
import { coordinatorAttentionQueryKey } from "@/lib/coordinator-attention";
import { MemoryRouter } from "@/lib/router";
import { CoordinatorTasks } from "./CoordinatorTasks";

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), attention: vi.fn(), breadcrumbs: vi.fn() }));
vi.mock("@/api/issues", () => ({ issuesApi: { list: mocks.list, get: mocks.get, listLabels: async () => [], update: vi.fn() } }));
vi.mock("@/api/attention", () => ({ attentionApi: { list: mocks.attention } }));
vi.mock("@/api/agents", () => ({ agentsApi: { list: async () => [] } }));
vi.mock("@/api/projects", () => ({ projectsApi: { list: async () => [] } }));
vi.mock("@/api/access", () => ({ accessApi: { listUserDirectory: async () => ({ users: [] }) } }));
vi.mock("@/api/companies-query", () => ({ useAccountIdentity: () => ({ userId: "person" }) }));
vi.mock("@/context/CompanyContext", () => ({ useCompany: () => ({ selectedCompanyId: "company" }) }));
vi.mock("@/context/DialogContext", () => ({ useDialogActions: () => ({ openNewIssue: vi.fn() }) }));
vi.mock("@/context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: mocks.breadcrumbs }) }));
vi.mock("@/components/TaskListToolbar", () => ({ TaskListToolbar: () => null }));
vi.mock("@/components/KanbanBoard", () => ({ KanbanBoard: () => null }));
vi.mock("@/components/TaskList", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/TaskList")>(),
  TaskList: ({ items, emptyState }: { items: { issue: { id: string; title: string } }[]; emptyState: React.ReactNode }) =>
    <div>{items.length ? items.map(item => <p key={item.issue.id} data-task-id={item.issue.id}>{item.issue.title}</p>) : emptyState}</div>,
}));

describe("Coordinator tasks using the proposed table", () => {
  let root: Root, host: HTMLDivElement, client: QueryClient;
  const pending = createIssue({ id: "pending", companyId: "company", status: "todo", parentId: null, title: "Needs a channel answer" });
  const decision = { subject: { kind: "interaction", id: "question" }, relatedIssue: { id: pending.id } } as AttentionItem;
  beforeEach(() => {
    vi.clearAllMocks(); localStorage.clear();
    mocks.attention.mockResolvedValue({ items: [decision, { ...decision, subject: { kind: "interaction", id: "approval" } }] });
    mocks.get.mockResolvedValue(pending);
    mocks.list.mockResolvedValue([createIssue({ id: "unrelated-review", companyId: "company", status: "in_review", parentId: null })]);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { flushSync(() => root.unmount()); client.clear(); host.remove(); });
  async function mount(url: string) {
    flushSync(() => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><CoordinatorTasks /></MemoryRouter></QueryClientProvider>));
    await vi.waitFor(() => expect(host.textContent).not.toContain("Loading tasks"));
  }
  it("hydrates distinct pending task IDs independently of status and the first task-list page", async () => {
    await mount("/issues?view=needs_attention");
    expect([...host.querySelectorAll("[data-task-id]")].map(node => node.getAttribute("data-task-id"))).toEqual(["pending"]);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.list).not.toHaveBeenCalled();
    // The same cache update used by Needs You removes the task only after its
    // last decision has resolved; no parallel status-based queue is involved.
    flushSync(() => client.setQueryData(coordinatorAttentionQueryKey("company"), { items: [decision] }));
    await vi.waitFor(() => expect(host.querySelectorAll("[data-task-id]")).toHaveLength(1));
    flushSync(() => client.setQueryData(coordinatorAttentionQueryKey("company"), { items: [] }));
    await vi.waitFor(() => expect(host.textContent).toContain("No tasks need a decision."));
  });
  it("preserves server search and scoped task links rather than searching only the first page", async () => {
    mocks.list.mockResolvedValue([createIssue({ id: "search-result", companyId: "company", parentId: null, description: "launch description" })]);
    await mount("/issues?q=launch&participantAgentId=agent&workspaceId=workspace");
    expect(mocks.list).toHaveBeenCalledWith("company", expect.objectContaining({ q: "launch", participantAgentId: "agent", workspaceId: "workspace", offset: 0 }), expect.anything());
    expect(host.querySelector('[data-task-id="search-result"]')).not.toBeNull();
  });
  it("keeps inaccessible or failed pending tasks visible as an error, not a false all-clear", async () => {
    mocks.get.mockRejectedValue(new Error("Task unavailable"));
    await mount("/issues?view=needs_attention");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Task unavailable");
    expect(host.textContent).not.toContain("No tasks need a decision.");
  });
});
