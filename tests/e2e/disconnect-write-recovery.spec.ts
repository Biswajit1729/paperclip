import { test, expect, type APIResponse } from "@playwright/test";

async function json(response: APIResponse) {
  const body = await response.text();
  expect(response.ok(), `${response.url()}: ${response.status()} ${body}`).toBe(true);
  return JSON.parse(body);
}

test("a task title survives an outage and saves after server recovery", async ({ page, request }) => {
  const company = await json(await request.post("/api/companies", { data: { name: `Write recovery ${Date.now()}` } }));
  try {
    const issue = await json(await request.post(`/api/companies/${company.id}/issues`, {
      data: { title: "Original task title", status: "backlog" },
    }));
    const other = await json(await request.post(`/api/companies/${company.id}/issues`, {
      data: { title: "Another task stays unchanged", status: "backlog" },
    }));
    await page.goto(`/${company.issuePrefix}/issues/${issue.identifier}`);
    const header = page.getByTestId("issue-detail-header");
    await expect(header.getByRole("heading", { name: issue.title, exact: true })).toBeVisible();

    let unavailable = true;
    let failedWrites = 0;
    await page.route("**/api/**", async route => {
      if (!unavailable) return route.continue();
      if (route.request().method() === "PATCH" && [`/api/issues/${issue.id}`, `/api/issues/${issue.identifier}`].includes(new URL(route.request().url()).pathname)) {
        failedWrites += 1;
      }
      if (!failedWrites) return route.continue();
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "tenant_app_unavailable" }) });
    });
    await header.getByRole("heading", { name: issue.title, exact: true }).click();
    const title = header.locator("textarea");
    await title.fill("A title retained through the outage");
    await title.press("Enter");
    await expect.poll(() => failedWrites).toBeGreaterThan(0);
    await expect(page.locator('[data-connection-status="reconnecting"]')).toBeVisible();
    expect((await json(await request.get(`/api/issues/${issue.id}`))).title).toBe(issue.title);
    await expect(header).toBeVisible();

    unavailable = false;
    await expect.poll(async () => (await json(await request.get(`/api/issues/${issue.id}`))).title,
      { timeout: 30_000 }).toBe("A title retained through the outage");
    expect((await json(await request.get(`/api/issues/${other.id}`))).title).toBe(other.title);
    await page.reload();
    await expect(header.getByRole("heading", { name: "A title retained through the outage", exact: true })).toBeVisible();
    expect((await json(await request.get(`/api/issues/${issue.id}`))).status).toBe("backlog");
  } finally {
    await request.patch(`/api/companies/${company.id}`, { data: { status: "archived" } });
  }
});
