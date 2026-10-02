// A saved job is a checkpoint: restore sidecar metadata and clean up without
// rendering or creating another Photos asset. Failures always retain the RAW.
async function completeHeifPlusJob(job, operations) {
  const rendered = job.state === "saved" ? job : await operations.render(job.id);
  if (job.state !== "saved") await operations.onRendered(rendered);
  const saved = job.state === "saved" ? job : await operations.save(job.id);
  await operations.onSaved(saved);
  await operations.discard(job.id);
  return saved;
}
module.exports = { completeHeifPlusJob };
