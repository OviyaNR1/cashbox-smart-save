import { base44 } from "@/api/base44Client";

/**
 * Records an admin action to the Audit Trail. Never throws — a logging
 * failure should never block the action it's describing.
 */
export async function logAudit({ module, action, record_id, details }) {
  try {
    const me = await base44.auth.me().catch(() => ({}));
    await base44.entities.AuditLog.create({
      actor_email: me.email || "unknown",
      created_by: me.id || null,
      module,
      action,
      record_id: record_id || null,
      details: details || null,
    });
  } catch (err) {
    console.error("Failed to record audit log:", err);
  }
}
