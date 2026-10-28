import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertKimiInstallationProfile, verifyKimiInstallation } from "./kimi-installation.js";
import { QUALIFIED_ACPX_PROFILES } from "./qualified-profiles.js";

const roots: string[] = [];
const previous = new Map<string, string | undefined>();
function environment(key: string, value: string) {
  if (!previous.has(key)) previous.set(key, process.env[key]);
  process.env[key] = value;
}
afterEach(async () => {
  for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  previous.clear();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("Kimi installed runtime admission", () => {
  it("rejects caller-selected package/version/command changes before filesystem resolution", () => {
    const profile = QUALIFIED_ACPX_PROFILES.kimi;
    expect(() => assertKimiInstallationProfile(profile)).not.toThrow();
    for (const alteration of [{ agentServerVersion: "latest" }, { agentServerPackage: "foreign" }, { commandDigest: `sha256:${"f".repeat(64)}` }, { agentProfileVersion: profile.agentProfileVersion + 1 }]) {
      expect(() => assertKimiInstallationProfile({ ...profile, ...alteration })).toThrow(/trusted declaration/);
    }
  });

  it("gives the normal setup command and never falls back to ambient kimi when assets are missing", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "paperclip-kimi-installation-test-"))); roots.push(root);
    await writeFile(join(root, "package.json"), '{"name":"@paperclipai/paperclip-runner"}');
    environment("PAPERCLIP_ACPX_PROVIDER_PACKAGE_ROOT", root);
    environment("PAPERCLIP_ACPX_PROVIDER_PACKAGE_MANIFEST", join(root, "package.json"));
    await expect(verifyKimiInstallation(QUALIFIED_ACPX_PROFILES.kimi)).rejects.toThrow(/paperclipai runtime setup kimi/);
    const assets = join(root, "provider-assets/kimi", `${process.platform}-${process.arch}`);
    await mkdir(join(assets, "runtime"), { recursive: true });
    await writeFile(join(assets, "kimi-distribution.json"), JSON.stringify({ schema: "paperclip.kimi-distribution.v1", nativeClosureSha256: "f".repeat(64) }));
    await expect(verifyKimiInstallation(QUALIFIED_ACPX_PROFILES.kimi)).rejects.toThrow(/source-owned pin/);
  });
});
