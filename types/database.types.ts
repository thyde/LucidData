export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          display_name: string | null
          key_salt: string | null
          key_hint: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          key_salt?: string | null
          key_hint?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          email?: string
          display_name?: string | null
          key_salt?: string | null
          key_hint?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vault_data: {
        Row: {
          id: string
          user_id: string
          label: string
          category: string
          tags: string[]
          schema_type: string
          description: string | null
          client_ciphertext: string
          encrypted_dek: string
          dek_salt: string
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          label: string
          category?: string
          tags?: string[]
          schema_type?: string
          description?: string | null
          client_ciphertext: string
          encrypted_dek: string
          dek_salt: string
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          label?: string
          category?: string
          tags?: string[]
          schema_type?: string
          description?: string | null
          client_ciphertext?: string
          encrypted_dek?: string
          dek_salt?: string
          expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          id: string
          user_id: string
          vault_data_id: string | null
          granted_to: string
          granted_to_name: string | null
          granted_to_email: string | null
          access_level: 'read' | 'export' | 'verify'
          purpose: string
          start_date: string
          end_date: string | null
          revoked: boolean
          revoked_at: string | null
          revoked_reason: string | null
          consent_type: 'explicit' | 'implied'
          ip_address: string | null
          user_agent: string | null
          terms_version: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          vault_data_id?: string | null
          granted_to: string
          granted_to_name?: string | null
          granted_to_email?: string | null
          access_level: 'read' | 'export' | 'verify'
          purpose: string
          start_date?: string
          end_date?: string | null
          revoked?: boolean
          consent_type?: 'explicit' | 'implied'
          ip_address?: string | null
          user_agent?: string | null
          terms_version?: string | null
        }
        Update: {
          end_date?: string | null
          revoked?: boolean
          revoked_at?: string | null
          revoked_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          vault_data_id: string | null
          consent_id: string | null
          event_type: string
          action: string
          actor_id: string | null
          actor_type: string
          actor_name: string | null
          ip_address: string | null
          user_agent: string | null
          method: string | null
          success: boolean
          error_message: string | null
          previous_hash: string | null
          current_hash: string
          metadata: Json | null
          timestamp: string
        }
        Insert: {
          id?: string
          user_id: string
          vault_data_id?: string | null
          consent_id?: string | null
          event_type: string
          action: string
          actor_id?: string | null
          actor_type?: string
          actor_name?: string | null
          ip_address?: string | null
          user_agent?: string | null
          method?: string | null
          success?: boolean
          error_message?: string | null
          previous_hash?: string | null
          current_hash: string
          metadata?: Json | null
          timestamp?: string
        }
        Update: never
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          email: string
          website: string | null
          api_key_hash: string
          verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          website?: string | null
          api_key_hash: string
          verified_at?: string | null
        }
        Update: {
          name?: string
          email?: string
          website?: string | null
          api_key_hash?: string
          verified_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consent_requests: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          data_category: string | null
          purpose: string
          access_level: 'read' | 'export' | 'verify'
          requested_at: string
          expires_at: string | null
          status: 'pending' | 'approved' | 'denied' | 'expired'
          response_note: string | null
          responded_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          data_category?: string | null
          purpose: string
          access_level: 'read' | 'export' | 'verify'
          expires_at?: string | null
          status?: 'pending' | 'approved' | 'denied' | 'expired'
        }
        Update: {
          status?: 'pending' | 'approved' | 'denied' | 'expired'
          response_note?: string | null
          responded_at?: string | null
        }
        Relationships: []
      }
      passkeys: {
        Row: {
          id: string
          user_id: string
          credential_id: string
          public_key: string
          counter: number
          device_name: string | null
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          credential_id: string
          public_key: string
          counter?: number
          device_name?: string | null
          created_at?: string
          last_used_at?: string | null
        }
        Update: {
          counter?: number
          device_name?: string | null
          last_used_at?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

export type User = Database['public']['Tables']['users']['Row']
export type VaultData = Database['public']['Tables']['vault_data']['Row']
export type Consent = Database['public']['Tables']['consents']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']
export type Organization = Database['public']['Tables']['organizations']['Row']
export type ConsentRequest = Database['public']['Tables']['consent_requests']['Row']
export type Passkey = Database['public']['Tables']['passkeys']['Row']

export type InsertVaultData = Database['public']['Tables']['vault_data']['Insert']
export type UpdateVaultData = Database['public']['Tables']['vault_data']['Update']
export type InsertConsent = Database['public']['Tables']['consents']['Insert']
export type UpdateConsent = Database['public']['Tables']['consents']['Update']
export type InsertAuditLog = Database['public']['Tables']['audit_logs']['Insert']
