import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface AuditLogInput {
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAuditLog(
  adminClient: SupabaseClient,
  entry: AuditLogInput
): Promise<void> {
  const { error } = await adminClient.from('audit_logs').insert({
    actor_user_id: entry.actorUserId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    metadata: entry.metadata ?? {},
  });

  if (error) {
    console.error('Failed to write audit log:', error.message, entry.action);
  }
}

