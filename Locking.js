function withLock_(ss, fn) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty("IN_PROCESS") === "1") return { skipped: true, reason: "IN_PROCESS" };
  props.setProperty("IN_PROCESS", "1");

  try {
    const result = fn();
    return result === undefined ? { skipped: false } : result;
  } finally {
    props.deleteProperty("IN_PROCESS");
    lock.releaseLock();
  }
}
function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}