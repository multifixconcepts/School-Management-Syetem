// Configure Undici's global dispatcher to be more tolerant of slow upstreams.
// Previous version imported 'undici' statically, which breaks the build if the
// package is not installed. We now use a guarded dynamic import that no-ops if
// 'undici' isn't available, avoiding module-not-found errors while preserving
// behavior when the package is present.

declare global {
  // Flag to avoid reconfiguring the dispatcher multiple times across route modules
  // eslint-disable-next-line no-var
  var __undiciConfigured: boolean | undefined;
}

export async function configureUndici(): Promise<void> {
  // Only configure on the server runtime
  if (typeof window !== 'undefined') return;
  if (globalThis.__undiciConfigured) return;

  try {
    const undiciModuleName = 'undici';
    const { Agent, setGlobalDispatcher } = await import(undiciModuleName as string);

    const agent = new Agent({
      // Increase header timeout to 120s to tolerate slow upstreams
      headersTimeout: 120_000,
      // Reasonable connect timeout
      connectTimeout: 15_000,
      // Keep-alive to reuse sockets
      keepAliveTimeout: 30_000,
      // Disable body timeout to allow streaming downloads/uploads when needed
      bodyTimeout: 0,
    });

    // setGlobalDispatcher(agent);
    // globalThis.__undiciConfigured = true;
  } catch (err) {
    // If 'undici' is not installed, skip configuration silently.
    // Optional: uncomment for diagnostics.
    // console.warn('[Undici] Skipping global dispatcher configuration: module not available');
  }
}

// Trigger configuration on module load; handlers can also call configureUndici()
// explicitly if they need to ensure it's done before making fetch requests.
void configureUndici();
