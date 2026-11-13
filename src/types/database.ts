export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      assistant_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "assistant_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_sessions: {
        Row: {
          context_id: string | null
          context_type: string | null
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          counterparty_id: string | null
          created_at: string
          id: string
          payment_agreement_id: string | null
          reason: string
          reporter_id: string
          resolution_note: string | null
          status: string
          summary: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          counterparty_id?: string | null
          created_at?: string
          id?: string
          payment_agreement_id?: string | null
          reason: string
          reporter_id: string
          resolution_note?: string | null
          status?: string
          summary: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          counterparty_id?: string | null
          created_at?: string
          id?: string
          payment_agreement_id?: string | null
          reason?: string
          reporter_id?: string
          resolution_note?: string | null
          status?: string
          summary?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_payment_agreement_id_fkey"
            columns: ["payment_agreement_id"]
            isOneToOne: false
            referencedRelation: "payment_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          byte_size: number | null
          created_at: string
          dispute_id: string
          id: string
          label: string
          mime_type: string | null
          note: string
          sha256: string | null
          storage_path: string | null
          submitted_by: string
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          dispute_id: string
          id?: string
          label: string
          mime_type?: string | null
          note: string
          sha256?: string | null
          storage_path?: string | null
          submitted_by: string
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          dispute_id?: string
          id?: string
          label?: string
          mime_type?: string | null
          note?: string
          sha256?: string | null
          storage_path?: string | null
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          detail: string
          id: string
          is_read: boolean
          metadata: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          detail: string
          id?: string
          is_read?: boolean
          metadata?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          detail?: string
          id?: string
          is_read?: boolean
          metadata?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_agreements: {
        Row: {
          amount_numeric: number
          counterparty_accepted_at: string | null
          counterparty_id: string | null
          created_at: string
          creator_accepted_at: string | null
          creator_id: string
          id: string
          network: string
          payment_request_id: string | null
          status: string
          terms_text: string
          title: string
          token_symbol: string
          updated_at: string
        }
        Insert: {
          amount_numeric: number
          counterparty_accepted_at?: string | null
          counterparty_id?: string | null
          created_at?: string
          creator_accepted_at?: string | null
          creator_id: string
          id?: string
          network?: string
          payment_request_id?: string | null
          status?: string
          terms_text: string
          title: string
          token_symbol: string
          updated_at?: string
        }
        Update: {
          amount_numeric?: number
          counterparty_accepted_at?: string | null
          counterparty_id?: string | null
          created_at?: string
          creator_accepted_at?: string | null
          creator_id?: string
          id?: string
          network?: string
          payment_request_id?: string | null
          status?: string
          terms_text?: string
          title?: string
          token_symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_agreements_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_agreements_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_agreements_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          amount_atomic: string
          amount_numeric: number
          created_at: string
          creator_id: string
          description: string
          expires_at: string | null
          id: string
          network: string
          recipient_address: string
          recipient_name: string
          share_code: string
          status: string
          terms: string | null
          token_decimals: number
          token_symbol: string
          updated_at: string
        }
        Insert: {
          amount_atomic: string
          amount_numeric: number
          created_at?: string
          creator_id: string
          description: string
          expires_at?: string | null
          id?: string
          network?: string
          recipient_address: string
          recipient_name: string
          share_code: string
          status?: string
          terms?: string | null
          token_decimals?: number
          token_symbol: string
          updated_at?: string
        }
        Update: {
          amount_atomic?: string
          amount_numeric?: number
          created_at?: string
          creator_id?: string
          description?: string
          expires_at?: string | null
          id?: string
          network?: string
          recipient_address?: string
          recipient_name?: string
          share_code?: string
          status?: string
          terms?: string | null
          token_decimals?: number
          token_symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_network: string
          display_name: string
          email: string | null
          id: string
          onboarding_completed: boolean
          preferences: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_network?: string
          display_name?: string
          email?: string | null
          id: string
          onboarding_completed?: boolean
          preferences?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_network?: string
          display_name?: string
          email?: string | null
          id?: string
          onboarding_completed?: boolean
          preferences?: Json
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          request_count: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          request_count?: number
          window_start?: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      risk_assessments: {
        Row: {
          created_at: string
          factors: Json
          id: string
          network: string
          payment_request_id: string | null
          recipient_address: string
          risk_level: string
          risk_score: number
          summary: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          factors?: Json
          id?: string
          network?: string
          payment_request_id?: string | null
          recipient_address: string
          risk_level: string
          risk_score: number
          summary: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          factors?: Json
          id?: string
          network?: string
          payment_request_id?: string | null
          recipient_address?: string
          risk_level?: string
          risk_score?: number
          summary?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessments_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_atomic: string
          amount_numeric: number
          created_at: string
          id: string
          network: string
          payment_agreement_id: string | null
          payment_request_id: string | null
          purpose: string
          receipt_verified_at: string | null
          recipient_address: string
          recipient_id: string | null
          recipient_name: string
          sender_address: string | null
          sender_id: string
          status: string
          token_decimals: number
          token_symbol: string
          tx_hash: string | null
          updated_at: string
          verified_control: boolean
        }
        Insert: {
          amount_atomic: string
          amount_numeric: number
          created_at?: string
          id?: string
          network?: string
          payment_agreement_id?: string | null
          payment_request_id?: string | null
          purpose: string
          receipt_verified_at?: string | null
          recipient_address: string
          recipient_id?: string | null
          recipient_name: string
          sender_address?: string | null
          sender_id: string
          status?: string
          token_decimals?: number
          token_symbol: string
          tx_hash?: string | null
          updated_at?: string
          verified_control?: boolean
        }
        Update: {
          amount_atomic?: string
          amount_numeric?: number
          created_at?: string
          id?: string
          network?: string
          payment_agreement_id?: string | null
          payment_request_id?: string | null
          purpose?: string
          receipt_verified_at?: string | null
          recipient_address?: string
          recipient_id?: string | null
          recipient_name?: string
          sender_address?: string | null
          sender_id?: string
          status?: string
          token_decimals?: number
          token_symbol?: string
          tx_hash?: string | null
          updated_at?: string
          verified_control?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "transactions_payment_agreement_id_fkey"
            columns: ["payment_agreement_id"]
            isOneToOne: false
            referencedRelation: "payment_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_request_id_fkey"
            columns: ["payment_request_id"]
            isOneToOne: false
            referencedRelation: "payment_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_records: {
        Row: {
          created_at: string
          id: string
          network: string
          proof_metadata: Json
          status: string
          subject_address: string
          transaction_id: string | null
          user_id: string
          verification_type: string
          verified_at: string | null
          wallet_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          network?: string
          proof_metadata?: Json
          status: string
          subject_address: string
          transaction_id?: string | null
          user_id: string
          verification_type: string
          verified_at?: string | null
          wallet_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          network?: string
          proof_metadata?: Json
          status?: string
          subject_address?: string
          transaction_id?: string | null
          user_id?: string
          verification_type?: string
          verified_at?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_records_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_records_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_challenges: {
        Row: {
          address: string
          created_at: string
          expires_at: string
          id: string
          message: string
          network: string
          nonce: string
          signature: string | null
          status: string
          user_id: string
          verified_at: string | null
          wallet_id: string | null
        }
        Insert: {
          address: string
          created_at?: string
          expires_at: string
          id?: string
          message: string
          network?: string
          nonce: string
          signature?: string | null
          status?: string
          user_id: string
          verified_at?: string | null
          wallet_id?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          expires_at?: string
          id?: string
          message?: string
          network?: string
          nonce?: string
          signature?: string | null
          status?: string
          user_id?: string
          verified_at?: string | null
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_challenges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_challenges_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          address: string
          created_at: string
          id: string
          is_primary: boolean
          is_verified: boolean
          label: string
          method: string
          network: string
          recovery_backed_up: boolean
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          label?: string
          method: string
          network?: string
          recovery_backed_up?: boolean
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          is_verified?: boolean
          label?: string
          method?: string
          network?: string
          recovery_backed_up?: boolean
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
