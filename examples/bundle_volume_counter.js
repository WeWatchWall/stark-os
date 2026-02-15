// Example: Volume Counter Pack (Isomorphic)
// Demonstrates a pod that persists a counter to a named volume.
// The counter survives pod restarts because it is stored on a volume.
//
// This pack:
//   1. Reads a counter value from context.volumes['data'] (or starts at 0)
//   2. Increments the counter every second
//   3. Writes the updated counter back so it persists across restarts
//
// Usage:
//   1. Create a volume:            stark volume create counter-data --node production-node-1
//   2. Register this pack:         stark pack register examples/bundle_volume_counter.js --name volume-counter -V 0.0.1 -r universal --visibility public
//   3. Create a pod with volume:   stark pod create volume-counter --node production-node-1 --volume counter-data:/app/data
//
// Works in both Node.js and browser (Web Worker) environments.
module.exports.default = async function(context) {
  var podId = context.podId || 'unknown-pod';
  var serviceName = 'volume-counter';
  var runtime = typeof require !== 'undefined' ? 'node' : 'browser';
  var volumePath = '/app/data';
  var counterFile = volumePath + '/counter.json';

  console.log('[' + serviceName + '] Starting on pod ' + podId + ' (runtime: ' + runtime + ')');

  // ── Read persisted counter from volume ──
  var counter = 0;
  var volumeInfo = context.volumeMounts || [];
  var hasVolume = volumeInfo.some(function(m) { return m.mountPath === volumePath; });

  if (hasVolume) {
    console.log('[' + serviceName + '] Volume mounted at ' + volumePath);

    // In a real runtime, the orchestrator would provide file I/O via the volume.
    // Here we demonstrate the pattern using context.readFile / context.writeFile
    // which the runtime injects for volume-backed paths.
    if (context.readFile) {
      try {
        var raw = await context.readFile(counterFile);
        var data = JSON.parse(raw);
        counter = data.count || 0;
        console.log('[' + serviceName + '] Restored counter from volume: ' + counter);
      } catch (_e) {
        console.log('[' + serviceName + '] No existing counter file — starting fresh');
      }
    }
  } else {
    console.log('[' + serviceName + '] No volume at ' + volumePath + ' — counter is ephemeral');
  }

  // ── Increment loop ──
  while (!context.lifecycle || !context.lifecycle.isShuttingDown) {
    counter++;
    console.log('[' + serviceName + '] Counter: ' + counter + ' (pod ' + podId + ', runtime: ' + runtime + ')');

    // Persist to volume if available
    if (hasVolume && context.writeFile) {
      try {
        await context.writeFile(counterFile, JSON.stringify({ count: counter, updatedAt: new Date().toISOString(), podId: podId }));
      } catch (writeErr) {
        console.log('[' + serviceName + '] Failed to persist counter: ' + writeErr);
      }
    }

    await new Promise(function(resolve) { setTimeout(resolve, 1000); });
  }

  console.log('[' + serviceName + '] Shutting down at counter ' + counter);
  return { message: serviceName + ' stopped', lastCount: counter, podId: podId };
};
