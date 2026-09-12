// Decides which layout wins when the server sends state while a layout change
// of ours is still on its way there.
//
// The server broadcasts the whole state for many reasons — an agent changing
// status, a notification arriving — and those broadcasts carry whatever layout
// it had at the time. Taking them at face value would undo a layout the user
// has just dragged or split. So a layout stays ours until the server sends it
// back to us unchanged, which is the only acknowledgement we get.

// `pending` maps a workspace path to the JSON of the layout we last sent for
// it. Returns the layouts to show, and the paths whose journey is over.
export function mergeLayouts(incoming, pending) {
  const layouts = { ...incoming };
  const acknowledged = [];

  for (const [path, sent] of Object.entries(pending)) {
    const arrived = JSON.stringify(Object.hasOwn(incoming, path) ? incoming[path] : null);
    if (arrived === sent) {
      acknowledged.push(path);
      continue;
    }
    layouts[path] = JSON.parse(sent);
  }

  return { layouts, acknowledged };
}
