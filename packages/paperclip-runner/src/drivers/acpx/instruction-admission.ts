export async function admitAcpxInstructions(
  admission: { assertReady(): void },
  input: { providerSpawned: boolean; load: () => Promise<void>; refreshCommand: () => Promise<void> },
): Promise<void> {
  if (!input.providerSpawned) {
    await input.load();
    admission.assertReady();
    await input.refreshCommand();
  } else admission.assertReady();
}
