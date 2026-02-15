// Example: Shared Volume Log Service Pack (Isomorphic)
// Demonstrates multiple replicas of a service sharing a named volume for logging.
// All replicas write to the same volume, producing a shared append-only log.
//
// This pack:
//   1. Writes timestamped log entries to a shared volume
//   2. Periodically reads the shared log to show entries from all replicas
//   3. Demonstrates same-node volume sharing across service replicas
//
// Usage:
//   1. Create a volume:            stark volume create shared-log --node production-node-1
//   2. Register this pack:         stark pack register --name shared-log --file examples/bundle_volume_shared_log.js
//   3. Create a service (3 replicas sharing the volume on the same node):
//      stark service create shared-log-svc --pack shared-log --replicas 3 --node production-node-1 --volume shared-log:/app/logs
//   4. Download the shared log:    stark volume download shared-log --node production-node-1 --out-file ./shared-log.tar
//
// Works in both Node.js and browser (Web Worker) environments.
module.exports.default = async function(context) {
  var podId = context.podId || 'unknown-pod';
  var serviceName = 'shared-log-service';
  var runtime = typeof require !== 'undefined' ? 'node' : 'browser';
  var volumePath = '/app/logs';
  var logFile = volumePath + '/shared.log';
  var entryCount = 0;

  console.log('[' + serviceName + '] Starting on pod ' + podId + ' (runtime: ' + runtime + ')');

  // ── Check for volume mount ──
  var volumeInfo = context.volumeMounts || [];
  var hasVolume = volumeInfo.some(function(m) { return m.mountPath === volumePath; });

  if (hasVolume) {
    console.log('[' + serviceName + '] Shared volume mounted at ' + volumePath);
  } else {
    console.log('[' + serviceName + '] No shared volume — logging to console only');
  }

  // ── Write/read loop ──
  while (!context.lifecycle || !context.lifecycle.isShuttingDown) {
    entryCount++;
    var timestamp = new Date().toISOString();
    var entry = timestamp + ' [pod:' + podId + '] Entry #' + entryCount + ' (runtime: ' + runtime + ')';

    console.log('[' + serviceName + '] Writing: ' + entry);

    // Append to shared log on volume
    if (hasVolume && context.appendFile) {
      try {
        await context.appendFile(logFile, entry + '\n');
      } catch (appendErr) {
        console.log('[' + serviceName + '] Failed to append: ' + appendErr);
      }
    }

    // Periodically read the full shared log to show cross-replica entries
    if (entryCount % 5 === 0 && hasVolume && context.readFile) {
      try {
        var contents = await context.readFile(logFile);
        var lines = contents.split('\n').filter(function(l) { return l.length > 0; });
        console.log('[' + serviceName + '] Shared log has ' + lines.length + ' total entries from all replicas');
        // Show the last 3 entries
        var recent = lines.slice(-3);
        for (var i = 0; i < recent.length; i++) {
          console.log('[' + serviceName + ']   > ' + recent[i]);
        }
      } catch (readErr) {
        console.log('[' + serviceName + '] Failed to read shared log: ' + readErr);
      }
    }

    await new Promise(function(resolve) { setTimeout(resolve, 2000); });
  }

  console.log('[' + serviceName + '] Shutting down after ' + entryCount + ' entries on pod ' + podId);
  return { message: serviceName + ' stopped', entries: entryCount, podId: podId };
};
