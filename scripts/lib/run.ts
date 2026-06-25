export function runCliMain(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(message);
    process.exit(1);
  });
}
