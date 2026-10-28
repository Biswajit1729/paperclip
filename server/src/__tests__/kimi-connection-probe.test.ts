import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionTarget } from "@paperclipai/adapter-utils/execution-target";
import { KIMI_DISTRIBUTION_CLOSURE_SHA256, KIMI_NODE_DISTRIBUTIONS, KIMI_NODE_VERSION, KIMI_RUNTIME_VERSION } from "../../../packages/paperclip-runner/src/drivers/acpx/kimi-closure-pins.js";
import { QUALIFIED_ACPX_PROFILES } from "../../../packages/paperclip-runner/src/drivers/acpx/qualified-profiles.js";

const mocks = vi.hoisted(() => ({ command: vi.fn(), local: vi.fn(), digest: vi.fn() }));
vi.mock("@paperclipai/adapter-utils/execution-target", () => ({ runAdapterExecutionTargetShellCommand: mocks.command }));
vi.mock("../vendor/paperclip-runner/live/index.js", async () => {
  const provider = await import("../../../packages/paperclip-runner/src/drivers/acpx/kimi-metadata-probe.js");
  return { probeKimiMetadata: mocks.local, kimiMetadataProbeDigest: mocks.digest,
    validateKimiMetadata: provider.validateKimiMetadata, kimiMetadataProbeNodeDigest: provider.kimiMetadataProbeNodeDigest };
});
import { probeKimiExecutionTarget } from "../services/kimi-connection-probe.js";

const model = "selected-model'; $(never-execute)";
const apiKey = "selected-secret'; $(never-execute)";
const digest = `sha256:${"a".repeat(64)}`;
const remote = { kind: "remote", transport: "sandbox", remoteCwd: "/workspace" } as AdapterExecutionTarget;
const verified = () => ({ schema: "paperclip.kimi.metadata.v1", status: "verified", version: KIMI_RUNTIME_VERSION,
  nodeVersion: KIMI_NODE_VERSION, profileDigest: QUALIFIED_ACPX_PROFILES.kimi.commandDigest, target: "linux-x64",
  closureDigest: `sha256:${KIMI_DISTRIBUTION_CLOSURE_SHA256["linux-x64"]}`, model, contextLength: 1048576, promptSent: false });
const response = (value: unknown = verified(), exitCode = 0) => ({ stdout: JSON.stringify(value), stderr: "", exitCode, signal: null, timedOut: false });
const failed = (code: string) => ({ schema: "paperclip.kimi.metadata.v1", status: "failed", code, message: apiKey, promptSent: false });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.digest.mockResolvedValue(digest);
  mocks.command.mockResolvedValue(response());
  mocks.local.mockResolvedValue(verified());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Kimi setup on a selected execution target", () => {
  it.each(["sandbox", "ssh"])("uses admitted fixed bytes and only explicit credentials on %s", async transport => {
    vi.stubEnv("KIMI_API_KEY", "unselected-ambient-secret");
    vi.stubEnv("KIMI_CODE_BASE_URL", "https://unselected.example");
    const target = { ...remote, transport } as AdapterExecutionTarget;
    await expect(probeKimiExecutionTarget(apiKey, target, model)).resolves.toEqual(verified());
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.command).toHaveBeenCalledOnce();
    const [, selected, command, options] = mocks.command.mock.calls[0]!;
    expect(selected).toBe(target);
    expect(command).toContain("pack=/opt/paperclip-runner/provider-pack");
    expect(command).toContain('node="$pack/provider-assets/kimi/linux-x64/runtime/node/bin/node"');
    expect(command).toContain('/usr/bin/sha256sum "$entry"');
    expect(command).toContain(digest.slice(7));
    expect(command).toContain('/usr/bin/sha256sum "$node"');
    expect(command).toContain(KIMI_NODE_DISTRIBUTIONS["linux-x64"].executableSha256);
    expect(command.indexOf('/usr/bin/sha256sum "$entry"')).toBeLessThan(command.indexOf('exec /usr/bin/env -i'));
    expect(command.indexOf('/usr/bin/sha256sum "$node"')).toBeLessThan(command.indexOf('exec /usr/bin/env -i'));
    expect(command).toContain("unset NODE_OPTIONS NODE_PATH NODE_EXTRA_CA_CERTS");
    expect(command).toContain('PAPERCLIP_ACPX_PROVIDER_PACKAGE_ROOT="$pack"');
    expect(command).not.toContain(model);
    expect(command).not.toContain(apiKey);
    expect(options).toEqual({ cwd: "/workspace", env: { KIMI_API_KEY: apiKey, PAPERCLIP_KIMI_PROBE_MODEL: model }, timeoutSec: expect.any(Number), graceSec: 3 });
    expect(options.timeoutSec).toBeGreaterThan(0);
    expect(options.timeoutSec).toBeLessThanOrEqual(32);
    expect(JSON.stringify(options)).not.toContain("unselected");
  });

  it("keeps local verification explicit and does not run a remote command", async () => {
    for (const target of [undefined, null, { kind: "local" } as AdapterExecutionTarget]) {
      await expect(probeKimiExecutionTarget(apiKey, target, model)).resolves.toEqual(verified());
    }
    expect(mocks.local).toHaveBeenCalledTimes(3);
    expect(mocks.local).toHaveBeenCalledWith(model, apiKey);
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.digest).not.toHaveBeenCalled();
    mocks.local.mockResolvedValue(failed("KIMI_AUTH_REJECTED"));
    const error = await probeKimiExecutionTarget(apiKey, null, model).catch(error => error);
    expect(error).toMatchObject({ status: 422, details: { code: "KIMI_AUTH_REJECTED" } });
    expect(error.message).not.toContain(apiKey);
  });

  it("rejects task-only plugin hosting before credentials leave the server", async () => {
    const runnerTask = vi.fn();
    await expect(probeKimiExecutionTarget(apiKey, { ...remote, runnerTask } as AdapterExecutionTarget, model))
      .rejects.toMatchObject({ details: { code: "KIMI_INSTALLATION_INVALID" } });
    expect(runnerTask).not.toHaveBeenCalled();
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.digest).not.toHaveBeenCalled();
    expect(mocks.command).not.toHaveBeenCalled();
  });

  it("rejects absent or invalid key/model inputs before transmission", async () => {
    vi.stubEnv("KIMI_API_KEY", apiKey);
    for (const key of ["", " ", "key\nheader", "key\0header", "x".repeat(16385)]) {
      await expect(probeKimiExecutionTarget(key, remote, model)).rejects.toMatchObject({ details: { code: "KIMI_AUTH_REQUIRED" } });
    }
    for (const selected of ["", " ", "x\0y", "x".repeat(513), "\ud800"]) {
      await expect(probeKimiExecutionTarget(apiKey, remote, selected)).rejects.toMatchObject({ details: { code: "KIMI_MODEL_UNAVAILABLE" } });
    }
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.local).not.toHaveBeenCalled();
  });
});

describe("remote Kimi installation fallback and failure admission", () => {
  it.each(["missing", "different-cli-bytes", "installation", "profile", "closure"])("tries only the fixed home pack after %s", async variant => {
    const first = variant === "missing" ? { ...response(), stdout: "", exitCode: 127 }
      : variant === "different-cli-bytes" ? { ...response(), stdout: "", exitCode: 126 }
        : variant === "installation" ? response(failed("KIMI_INSTALLATION_INVALID"), 1)
          : response({ ...verified(), [variant === "profile" ? "profileDigest" : "closureDigest"]: `sha256:${"0".repeat(64)}` });
    mocks.command.mockResolvedValueOnce(first).mockResolvedValueOnce(response());
    await expect(probeKimiExecutionTarget(apiKey, remote, model)).resolves.toEqual(verified());
    expect(mocks.command).toHaveBeenCalledTimes(2);
    expect(mocks.command.mock.calls[1]![2]).toContain('pack="$HOME/.local/share/paperclip-runner/provider-pack"');
    expect(mocks.local).not.toHaveBeenCalled();
  });

  it.each(["KIMI_AUTH_REQUIRED", "KIMI_AUTH_REJECTED", "KIMI_MODEL_UNAVAILABLE", "KIMI_METADATA_TIMEOUT", "KIMI_METADATA_INVALID", "KIMI_PROVIDER_ERROR"])("keeps %s final and strips remote text", async code => {
    mocks.command.mockResolvedValueOnce(response(failed(code), 1));
    const error = await probeKimiExecutionTarget(apiKey, remote, model).catch(error => error);
    expect(error).toMatchObject({ status: 422, details: { code } });
    expect(error.message).not.toContain(apiKey);
    expect(mocks.command).toHaveBeenCalledOnce();
    expect(mocks.local).not.toHaveBeenCalled();
  });

  it.each([
    { stdout: "not json" }, { stdout: "x".repeat(65537) }, { signal: "SIGTERM" }, { timedOut: true },
    { exitCode: 1 }, { stdout: JSON.stringify({ ...verified(), promptSent: true }) },
    { stdout: JSON.stringify({ ...verified(), arbitrary: true }) },
  ])("never accepts malformed or interrupted success %#", alteration => {
    mocks.command.mockResolvedValue({ ...response(), ...alteration });
    return expect(probeKimiExecutionTarget(apiKey, remote, model)).rejects.toMatchObject({ details: { code: "KIMI_REQUEST_FAILED" } });
  });

  it("fails closed when no fixed remote installation matches without trying the controller", async () => {
    mocks.command.mockResolvedValue({ ...response(), stdout: "", exitCode: 127 });
    await expect(probeKimiExecutionTarget(apiKey, remote, model)).rejects.toMatchObject({ details: { code: "KIMI_INSTALLATION_INVALID" } });
    expect(mocks.command).toHaveBeenCalledTimes(2);
    expect(mocks.local).not.toHaveBeenCalled();
  });

  it("rejects a receipt for another model or release platform", async () => {
    mocks.command.mockResolvedValue(response({ ...verified(), model: "unselected-model" }));
    await expect(probeKimiExecutionTarget(apiKey, remote, model)).rejects.toMatchObject({ details: { code: "KIMI_MODEL_UNAVAILABLE" } });
    expect(mocks.command).toHaveBeenCalledOnce();
    mocks.command.mockResolvedValue(response({ ...verified(), target: "darwin-arm64", closureDigest: `sha256:${KIMI_DISTRIBUTION_CLOSURE_SHA256["darwin-arm64"]}` }));
    await expect(probeKimiExecutionTarget(apiKey, remote, model)).rejects.toMatchObject({ details: { code: "KIMI_INSTALLATION_INVALID" } });
  });

  it("requires the current bundled probe before transmitting credentials", async () => {
    for (const value of ["", "arbitrary-path", `sha256:${"f".repeat(63)}`]) {
      mocks.digest.mockResolvedValue(value);
      await expect(probeKimiExecutionTarget(apiKey, remote, model)).rejects.toMatchObject({ details: { code: "KIMI_INSTALLATION_INVALID" } });
    }
    mocks.digest.mockRejectedValue(new Error(`missing build ${apiKey}`));
    const error = await probeKimiExecutionTarget(apiKey, remote, model).catch(error => error);
    expect(error.message).not.toContain(apiKey);
    expect(mocks.command).not.toHaveBeenCalled();
  });

  it("shares the 35 second budget across local digest and both remote locations", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    mocks.digest.mockImplementation(async () => { now += 2000; return digest; });
    mocks.command.mockImplementationOnce(async () => { now += 20_000; return { ...response(), stdout: "", exitCode: 127 }; });
    await expect(probeKimiExecutionTarget(apiKey, remote, model)).resolves.toEqual(verified());
    expect(mocks.command.mock.calls[0]![3].timeoutSec).toBe(30);
    expect(mocks.command.mock.calls[1]![3].timeoutSec).toBe(10);
    mocks.command.mockReset().mockImplementation(async () => { now += 35_001; return response(); });
    await expect(probeKimiExecutionTarget(apiKey, remote, model)).rejects.toMatchObject({ details: { code: "KIMI_REQUEST_FAILED" } });
  });

  it("sanitizes transport errors without trying another host or local credentials", async () => {
    mocks.command.mockRejectedValue(new Error(`transport ${apiKey}`));
    const error = await probeKimiExecutionTarget(apiKey, remote, model).catch(error => error);
    expect(error).toMatchObject({ details: { code: "KIMI_REQUEST_FAILED" } });
    expect(error.message).not.toContain(apiKey);
    expect(mocks.command).toHaveBeenCalledOnce();
    expect(mocks.local).not.toHaveBeenCalled();
  });
});
