import { callEdgeFunction } from './apiClient';
import type { Database } from '../types/database';

export type AssistantSessionRow = Database['public']['Tables']['assistant_sessions']['Row'];
export type AssistantMessageRow = Database['public']['Tables']['assistant_messages']['Row'];

export async function listAssistantSessions(): Promise<AssistantSessionRow[]> {
  const res = await callEdgeFunction<{ sessions: AssistantSessionRow[] }>('assistant', {
    method: 'GET',
  });
  return res.sessions;
}

export async function listAssistantMessages(sessionId: string): Promise<AssistantMessageRow[]> {
  const res = await callEdgeFunction<{ messages: AssistantMessageRow[] }>('assistant', {
    method: 'GET',
    query: { sessionId },
  });
  return res.messages;
}

export async function sendAssistantMessage(params: {
  sessionId?: string;
  message: string;
  title?: string;
}): Promise<{
  sessionId: string;
  userMessage: AssistantMessageRow;
  assistantMessage: AssistantMessageRow;
}> {
  return callEdgeFunction('assistant', {
    method: 'POST',
    body: params,
  });
}

