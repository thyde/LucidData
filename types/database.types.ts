export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_type: string
          consent_id: string | null
          current_hash: string
          error_message: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          method: string | null
          previous_hash: string | null
          success: boolean
          timestamp: string
          user_agent: string | null
          user_id: string
          vault_data_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_type?: string
          consent_id?: string | null
          current_hash: string
          error_message?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          method?: string | null
          previous_hash?: string | null
          success?: boolean
          timestamp?: string
          user_agent?: string | null
          user_id: string
          vault_data_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_type?: string
          consent_id?: string | null
          current_hash?: string
          error_message?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          method?: string | null
          previous_hash?: string | null
          success?: boolean
          timestamp?: string
          user_agent?: string | null
          user_id?: string
          vault_data_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_vault_data_id_fkey"
            columns: ["vault_data_id"]
            isOneToOne: false
            referencedRelation: "vault_data"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_job_rows: {
        Row: {
          error: string | null
          id: string
          idempotency_key: string
          job_id: string
          payload: Json
          processed_at: string | null
          result_id: string | null
          row_index: number
          status: string
        }
        Insert: {
          error?: string | null
          id?: string
          idempotency_key: string
          job_id: string
          payload: Json
          processed_at?: string | null
          result_id?: string | null
          row_index: number
          status?: string
        }
        Update: {
          error?: string | null
          id?: string
          idempotency_key?: string
          job_id?: string
          payload?: Json
          processed_at?: string | null
          result_id?: string | null
          row_index?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_job_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "bulk_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_jobs: {
        Row: {
          cancel_requested_at: string | null
          created_at: string
          created_by: string | null
          error: string | null
          failed_rows: number
          finished_at: string | null
          id: string
          kind: string
          organization_id: string
          processed_rows: number
          started_at: string | null
          status: string
          succeeded_rows: number
          total_rows: number
        }
        Insert: {
          cancel_requested_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          failed_rows?: number
          finished_at?: string | null
          id?: string
          kind: string
          organization_id: string
          processed_rows?: number
          started_at?: string | null
          status?: string
          succeeded_rows?: number
          total_rows?: number
        }
        Update: {
          cancel_requested_at?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          failed_rows?: number
          finished_at?: string | null
          id?: string
          kind?: string
          organization_id?: string
          processed_rows?: number
          started_at?: string | null
          status?: string
          succeeded_rows?: number
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulk_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_receipts: {
        Row: {
          consent_id: string
          created_at: string
          event: string
          id: string
          key_id: string
          payload: Json
          recipient: string
          recipient_email: string | null
          signature: string
          supersedes_receipt_id: string | null
          user_id: string
        }
        Insert: {
          consent_id: string
          created_at?: string
          event: string
          id?: string
          key_id: string
          payload: Json
          recipient: string
          recipient_email?: string | null
          signature: string
          supersedes_receipt_id?: string | null
          user_id: string
        }
        Update: {
          consent_id?: string
          created_at?: string
          event?: string
          id?: string
          key_id?: string
          payload?: Json
          recipient?: string
          recipient_email?: string | null
          signature?: string
          supersedes_receipt_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_receipts_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_receipts_supersedes_receipt_id_fkey"
            columns: ["supersedes_receipt_id"]
            isOneToOne: false
            referencedRelation: "consent_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_requests: {
        Row: {
          access_level: string
          consent_id: string | null
          data_category: string | null
          expires_at: string | null
          id: string
          organization_id: string
          purpose: string
          requested_at: string
          responded_at: string | null
          response_note: string | null
          status: string
          user_id: string
        }
        Insert: {
          access_level: string
          consent_id?: string | null
          data_category?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          purpose: string
          requested_at?: string
          responded_at?: string | null
          response_note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          access_level?: string
          consent_id?: string | null
          data_category?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          purpose?: string
          requested_at?: string
          responded_at?: string | null
          response_note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_requests_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          access_level: string
          consent_type: string
          created_at: string
          data_category: string | null
          end_date: string | null
          expired_at: string | null
          granted_to: string
          granted_to_email: string | null
          granted_to_name: string | null
          id: string
          ip_address: string | null
          purpose: string
          revoked: boolean
          revoked_at: string | null
          revoked_reason: string | null
          start_date: string
          terms_version: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
          vault_data_id: string | null
        }
        Insert: {
          access_level: string
          consent_type?: string
          created_at?: string
          data_category?: string | null
          end_date?: string | null
          expired_at?: string | null
          granted_to: string
          granted_to_email?: string | null
          granted_to_name?: string | null
          id?: string
          ip_address?: string | null
          purpose: string
          revoked?: boolean
          revoked_at?: string | null
          revoked_reason?: string | null
          start_date?: string
          terms_version?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
          vault_data_id?: string | null
        }
        Update: {
          access_level?: string
          consent_type?: string
          created_at?: string
          data_category?: string | null
          end_date?: string | null
          expired_at?: string | null
          granted_to?: string
          granted_to_email?: string | null
          granted_to_name?: string | null
          id?: string
          ip_address?: string | null
          purpose?: string
          revoked?: boolean
          revoked_at?: string | null
          revoked_reason?: string | null
          start_date?: string
          terms_version?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          vault_data_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_vault_data_id_fkey"
            columns: ["vault_data_id"]
            isOneToOne: false
            referencedRelation: "vault_data"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_requests: {
        Row: {
          expires_at: string | null
          id: string
          message: string | null
          organization_id: string
          purpose: string
          requested_at: string
          requested_schema_types: string[]
          responded_at: string | null
          response_note: string | null
          status: string
          subject_email: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          message?: string | null
          organization_id: string
          purpose: string
          requested_at?: string
          requested_schema_types?: string[]
          responded_at?: string | null
          response_note?: string | null
          status?: string
          subject_email: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          message?: string | null
          organization_id?: string
          purpose?: string
          requested_at?: string
          requested_schema_types?: string[]
          responded_at?: string | null
          response_note?: string | null
          status?: string
          subject_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_shares: {
        Row: {
          created_at: string
          credential_id: string
          credential_request_id: string | null
          disclosed_claims: string[]
          expired_at: string | null
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          revoked: boolean
          revoked_at: string | null
          token_hash: string
          user_id: string
          verifier_email: string | null
          view_count: number
        }
        Insert: {
          created_at?: string
          credential_id: string
          credential_request_id?: string | null
          disclosed_claims?: string[]
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          revoked?: boolean
          revoked_at?: string | null
          token_hash: string
          user_id: string
          verifier_email?: string | null
          view_count?: number
        }
        Update: {
          created_at?: string
          credential_id?: string
          credential_request_id?: string | null
          disclosed_claims?: string[]
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          revoked?: boolean
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
          verifier_email?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "credential_shares_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "issued_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_shares_credential_request_id_fkey"
            columns: ["credential_request_id"]
            isOneToOne: false
            referencedRelation: "credential_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      data_order_records: {
        Row: {
          category: string
          contributed_at: string
          created_at: string
          id: string
          order_id: string
          payload: Json
          payout_cents: number
          redacted_at: string | null
          source_contribution_id: string | null
          source_user_id: string | null
        }
        Insert: {
          category: string
          contributed_at: string
          created_at?: string
          id?: string
          order_id: string
          payload: Json
          payout_cents: number
          redacted_at?: string | null
          source_contribution_id?: string | null
          source_user_id?: string | null
        }
        Update: {
          category?: string
          contributed_at?: string
          created_at?: string
          id?: string
          order_id?: string
          payload?: Json
          payout_cents?: number
          redacted_at?: string | null
          source_contribution_id?: string | null
          source_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_order_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "data_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_order_records_source_contribution_id_fkey"
            columns: ["source_contribution_id"]
            isOneToOne: false
            referencedRelation: "pool_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_order_records_source_user_id_fkey"
            columns: ["source_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      data_orders: {
        Row: {
          buyer_org_id: string
          created_at: string
          current_period_end: string | null
          export_expires_at: string
          export_token: string
          id: string
          order_type: string
          pool_id: string
          privacy_report: Json | null
          record_count: number
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          total_cents: number
        }
        Insert: {
          buyer_org_id: string
          created_at?: string
          current_period_end?: string | null
          export_expires_at?: string
          export_token: string
          id?: string
          order_type?: string
          pool_id: string
          privacy_report?: Json | null
          record_count?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_cents?: number
        }
        Update: {
          buyer_org_id?: string
          created_at?: string
          current_period_end?: string | null
          export_expires_at?: string
          export_token?: string
          id?: string
          order_type?: string
          pool_id?: string
          privacy_report?: Json | null
          record_count?: number
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "data_orders_buyer_org_id_fkey"
            columns: ["buyer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_orders_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "data_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      data_pools: {
        Row: {
          buyer_org_id: string
          category: string
          created_at: string
          description: string | null
          epsilon_budget: number
          epsilon_spent: number
          filters: Json | null
          id: string
          k_anonymity_target: number
          minimum_contributors: number
          name: string
          price_cents: number
          price_per_record_cents: number
          pricing_model: string
          purpose: string
          requested_fields: string[]
          retention_days: number
          status: string
          updated_at: string
        }
        Insert: {
          buyer_org_id: string
          category?: string
          created_at?: string
          description?: string | null
          epsilon_budget?: number
          epsilon_spent?: number
          filters?: Json | null
          id?: string
          k_anonymity_target?: number
          minimum_contributors?: number
          name: string
          price_cents?: number
          price_per_record_cents?: number
          pricing_model?: string
          purpose?: string
          requested_fields?: string[]
          retention_days?: number
          status?: string
          updated_at?: string
        }
        Update: {
          buyer_org_id?: string
          category?: string
          created_at?: string
          description?: string | null
          epsilon_budget?: number
          epsilon_spent?: number
          filters?: Json | null
          id?: string
          k_anonymity_target?: number
          minimum_contributors?: number
          name?: string
          price_cents?: number
          price_per_record_cents?: number
          pricing_model?: string
          purpose?: string
          requested_fields?: string[]
          retention_days?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_pools_buyer_org_id_fkey"
            columns: ["buyer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          created_at: string
          encrypted_access_token: string | null
          encrypted_refresh_token: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: string
          provider_account_id: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: string
          provider_account_id?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string
          provider_account_id?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_receipts: {
        Row: {
          id: string
          issued_at: string
          key_id: string
          payload: Json
          signature: string
          subject_email_hash: string
          subject_id: string
        }
        Insert: {
          id?: string
          issued_at?: string
          key_id: string
          payload: Json
          signature: string
          subject_email_hash: string
          subject_id: string
        }
        Update: {
          id?: string
          issued_at?: string
          key_id?: string
          payload?: Json
          signature?: string
          subject_email_hash?: string
          subject_id?: string
        }
        Relationships: []
      }
      issued_credentials: {
        Row: {
          claimed_at: string | null
          claims: Json
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string
          key_id: string
          label: string
          organization_id: string
          revocation_reason: string | null
          schema_type: string
          signature: string
          signed_payload: Json
          status: string
          subject_email: string
          subject_user_id: string | null
          vault_data_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          claims: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          key_id: string
          label: string
          organization_id: string
          revocation_reason?: string | null
          schema_type: string
          signature: string
          signed_payload: Json
          status?: string
          subject_email: string
          subject_user_id?: string | null
          vault_data_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          claims?: Json
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          key_id?: string
          label?: string
          organization_id?: string
          revocation_reason?: string | null
          schema_type?: string
          signature?: string
          signed_payload?: Json
          status?: string
          subject_email?: string
          subject_user_id?: string | null
          vault_data_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issued_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_credentials_subject_user_id_fkey"
            columns: ["subject_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_credentials_vault_data_id_fkey"
            columns: ["vault_data_id"]
            isOneToOne: false
            referencedRelation: "vault_data"
            referencedColumns: ["id"]
          },
        ]
      }
      issuer_keys: {
        Row: {
          alg: string
          compromised_at: string | null
          created_at: string
          encrypted_private_key: string
          id: string
          key_id: string
          organization_id: string
          private_key_iv: string
          public_key: string
          retired_at: string | null
          revoked_at: string | null
          rotation_reason: string | null
          status: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          alg?: string
          compromised_at?: string | null
          created_at?: string
          encrypted_private_key: string
          id?: string
          key_id: string
          organization_id: string
          private_key_iv: string
          public_key: string
          retired_at?: string | null
          revoked_at?: string | null
          rotation_reason?: string | null
          status?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          alg?: string
          compromised_at?: string | null
          created_at?: string
          encrypted_private_key?: string
          id?: string
          key_id?: string
          organization_id?: string
          private_key_iv?: string
          public_key?: string
          retired_at?: string | null
          revoked_at?: string | null
          rotation_reason?: string | null
          status?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issuer_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          error: string | null
          failed: number
          finished_at: string | null
          id: string
          job: string
          processed: number
          started_at: string
        }
        Insert: {
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          job: string
          processed?: number
          started_at?: string
        }
        Update: {
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: string
          job?: string
          processed?: number
          started_at?: string
        }
        Relationships: []
      }
      mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mfa_backup_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_claims: {
        Row: {
          buyer_org_id: string
          created_at: string
          id: string
          incentive: string
          offer_id: string
          offer_title: string
          redeemed_at: string | null
          redemption_code: string
          status: string
          target_category: string
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          buyer_org_id: string
          created_at?: string
          id?: string
          incentive: string
          offer_id: string
          offer_title: string
          redeemed_at?: string | null
          redemption_code: string
          status?: string
          target_category: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          buyer_org_id?: string
          created_at?: string
          id?: string
          incentive?: string
          offer_id?: string
          offer_title?: string
          redeemed_at?: string | null
          redemption_code?: string
          status?: string
          target_category?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_claims_buyer_org_id_fkey"
            columns: ["buyer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          buyer_org_id: string
          created_at: string
          description: string | null
          id: string
          incentive: string
          status: string
          target_category: string
          title: string
        }
        Insert: {
          buyer_org_id: string
          created_at?: string
          description?: string | null
          id?: string
          incentive: string
          status?: string
          target_category?: string
          title: string
        }
        Update: {
          buyer_org_id?: string
          created_at?: string
          description?: string | null
          id?: string
          incentive?: string
          status?: string
          target_category?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_buyer_org_id_fkey"
            columns: ["buyer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      org_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          organization_id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          organization_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_webhooks: {
        Row: {
          created_at: string
          description: string | null
          events: string[]
          id: string
          organization_id: string
          secret_hash: string
          secret_prefix: string
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          organization_id: string
          secret_hash: string
          secret_prefix: string
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          organization_id?: string
          secret_hash?: string
          secret_prefix?: string
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_api_keys: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          key_suffix: string | null
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash: string
          key_suffix?: string | null
          last_used_at?: string | null
          name?: string
          organization_id: string
          revoked_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_suffix?: string | null
          last_used_at?: string | null
          name?: string
          organization_id?: string
          revoked_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          api_key_hash: string
          created_at: string
          data_buyer: boolean
          domain: string | null
          domain_verification_token: string | null
          email: string
          id: string
          name: string
          org_type: string
          updated_at: string
          verified_at: string | null
          website: string | null
        }
        Insert: {
          api_key_hash: string
          created_at?: string
          data_buyer?: boolean
          domain?: string | null
          domain_verification_token?: string | null
          email: string
          id?: string
          name: string
          org_type?: string
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          api_key_hash?: string
          created_at?: string
          data_buyer?: boolean
          domain?: string | null
          domain_verification_token?: string | null
          email?: string
          id?: string
          name?: string
          org_type?: string
          updated_at?: string
          verified_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      passkeys: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "passkeys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_accounts: {
        Row: {
          created_at: string
          details_submitted: boolean
          payouts_enabled: boolean
          stripe_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details_submitted?: boolean
          payouts_enabled?: boolean
          stripe_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details_submitted?: boolean
          payouts_enabled?: boolean
          stripe_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_cents: number
          attempts: number
          contribution_id: string | null
          created_at: string
          data_order_id: string | null
          fee_bps: number
          gross_cents: number
          id: string
          last_error: string | null
          next_attempt_at: string | null
          platform_fee_cents: number
          pool_id: string | null
          status: string
          stripe_transfer_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          attempts?: number
          contribution_id?: string | null
          created_at?: string
          data_order_id?: string | null
          fee_bps?: number
          gross_cents?: number
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          platform_fee_cents?: number
          pool_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          attempts?: number
          contribution_id?: string | null
          created_at?: string
          data_order_id?: string | null
          fee_bps?: number
          gross_cents?: number
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          platform_fee_cents?: number
          pool_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "pool_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_data_order_id_fkey"
            columns: ["data_order_id"]
            isOneToOne: false
            referencedRelation: "data_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "data_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_ingest: {
        Row: {
          captured_at: string | null
          category: string
          created_at: string
          data_source_id: string
          id: string
          label: string
          provider_record_id: string
          schema_type: string
          sealed_payload: string
          user_id: string
        }
        Insert: {
          captured_at?: string | null
          category?: string
          created_at?: string
          data_source_id: string
          id?: string
          label: string
          provider_record_id: string
          schema_type: string
          sealed_payload: string
          user_id: string
        }
        Update: {
          captured_at?: string | null
          category?: string
          created_at?: string
          data_source_id?: string
          id?: string
          label?: string
          provider_record_id?: string
          schema_type?: string
          sealed_payload?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_ingest_data_source_id_fkey"
            columns: ["data_source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_ingest_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_keys: {
        Row: {
          alg: string
          created_at: string
          encrypted_private_key: string
          id: string
          key_id: string
          private_key_iv: string
          public_key: string
          purpose: string
          retired_at: string | null
          status: string
        }
        Insert: {
          alg?: string
          created_at?: string
          encrypted_private_key: string
          id?: string
          key_id: string
          private_key_iv: string
          public_key: string
          purpose: string
          retired_at?: string | null
          status?: string
        }
        Update: {
          alg?: string
          created_at?: string
          encrypted_private_key?: string
          id?: string
          key_id?: string
          private_key_iv?: string
          public_key?: string
          purpose?: string
          retired_at?: string | null
          status?: string
        }
        Relationships: []
      }
      pool_contributions: {
        Row: {
          anonymized_payload: Json
          category: string
          consent_version: string
          consented_at: string
          created_at: string
          declared_purpose: string
          id: string
          payout_cents: number
          platform_fee_bps: number
          pool_id: string
          schema_type: string | null
          status: string
          updated_at: string
          user_id: string
          vault_data_id: string | null
        }
        Insert: {
          anonymized_payload: Json
          category?: string
          consent_version?: string
          consented_at?: string
          created_at?: string
          declared_purpose?: string
          id?: string
          payout_cents?: number
          platform_fee_bps?: number
          pool_id: string
          schema_type?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vault_data_id?: string | null
        }
        Update: {
          anonymized_payload?: Json
          category?: string
          consent_version?: string
          consented_at?: string
          created_at?: string
          declared_purpose?: string
          id?: string
          payout_cents?: number
          platform_fee_bps?: number
          pool_id?: string
          schema_type?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vault_data_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pool_contributions_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "data_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_contributions_vault_data_id_fkey"
            columns: ["vault_data_id"]
            isOneToOne: false
            referencedRelation: "vault_data"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_counters: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      recovery_factors: {
        Row: {
          created_at: string
          id: string
          label: string
          last_confirmed_at: string | null
          salt: string
          type: string
          user_id: string
          wrapped_master_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          last_confirmed_at?: string | null
          salt: string
          type: string
          user_id: string
          wrapped_master_key: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_confirmed_at?: string | null
          salt?: string
          type?: string
          user_id?: string
          wrapped_master_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_factors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      revoked_sessions: {
        Row: {
          revoked_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          revoked_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          revoked_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revoked_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rights_case_events: {
        Row: {
          actor: string
          case_id: string
          created_at: string
          detail: string | null
          event: string
          id: string
        }
        Insert: {
          actor: string
          case_id: string
          created_at?: string
          detail?: string | null
          event: string
          id?: string
        }
        Update: {
          actor?: string
          case_id?: string
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rights_case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "rights_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      rights_cases: {
        Row: {
          appeal_of_case_id: string | null
          created_at: string
          detail: string | null
          due_at: string
          extended_to: string | null
          id: string
          jurisdiction: string
          paused_at: string | null
          paused_ms: number
          received_at: string
          resolution: string | null
          resolution_note: string | null
          resumed_at: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appeal_of_case_id?: string | null
          created_at?: string
          detail?: string | null
          due_at: string
          extended_to?: string | null
          id?: string
          jurisdiction: string
          paused_at?: string | null
          paused_ms?: number
          received_at?: string
          resolution?: string | null
          resolution_note?: string | null
          resumed_at?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appeal_of_case_id?: string | null
          created_at?: string
          detail?: string | null
          due_at?: string
          extended_to?: string | null
          id?: string
          jurisdiction?: string
          paused_at?: string | null
          paused_ms?: number
          received_at?: string
          resolution?: string | null
          resolution_note?: string | null
          resumed_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rights_cases_appeal_of_case_id_fkey"
            columns: ["appeal_of_case_id"]
            isOneToOne: false
            referencedRelation: "rights_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rights_cases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_preferences: {
        Row: {
          allowed_purposes: string[]
          auto_optin: boolean
          blocked_buyer_orgs: string[]
          created_at: string
          min_price_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_purposes?: string[]
          auto_optin?: boolean
          blocked_buyer_orgs?: string[]
          created_at?: string
          min_price_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_purposes?: string[]
          auto_optin?: boolean
          blocked_buyer_orgs?: string[]
          created_at?: string
          min_price_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      step_up_grants: {
        Row: {
          action: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          action: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          action?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_up_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          organization_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          organization_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          email_notifications_enabled: boolean
          id: string
          ingest_key_salt: string | null
          ingest_public_key: string | null
          key_hint: string | null
          key_salt: string | null
          onboarding_completed: boolean
          recovery_code_salt: string | null
          recovery_codes_generated_at: string | null
          recovery_last_confirmed_at: string | null
          recovery_setup_declined_at: string | null
          universal_opt_out: boolean
          universal_opt_out_at: string | null
          universal_opt_out_override_at: string | null
          universal_opt_out_source: string | null
          updated_at: string
          wrapped_ingest_private_key: string | null
          wrapped_master_key: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          email_notifications_enabled?: boolean
          id: string
          ingest_key_salt?: string | null
          ingest_public_key?: string | null
          key_hint?: string | null
          key_salt?: string | null
          onboarding_completed?: boolean
          recovery_code_salt?: string | null
          recovery_codes_generated_at?: string | null
          recovery_last_confirmed_at?: string | null
          recovery_setup_declined_at?: string | null
          universal_opt_out?: boolean
          universal_opt_out_at?: string | null
          universal_opt_out_override_at?: string | null
          universal_opt_out_source?: string | null
          updated_at?: string
          wrapped_ingest_private_key?: string | null
          wrapped_master_key?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          email_notifications_enabled?: boolean
          id?: string
          ingest_key_salt?: string | null
          ingest_public_key?: string | null
          key_hint?: string | null
          key_salt?: string | null
          onboarding_completed?: boolean
          recovery_code_salt?: string | null
          recovery_codes_generated_at?: string | null
          recovery_last_confirmed_at?: string | null
          recovery_setup_declined_at?: string | null
          universal_opt_out?: boolean
          universal_opt_out_at?: string | null
          universal_opt_out_override_at?: string | null
          universal_opt_out_source?: string | null
          updated_at?: string
          wrapped_ingest_private_key?: string | null
          wrapped_master_key?: string | null
        }
        Relationships: []
      }
      vault_data: {
        Row: {
          category: string
          client_ciphertext: string
          created_at: string
          dek_salt: string
          description: string | null
          encrypted_dek: string
          expires_at: string | null
          id: string
          label: string
          schema_type: string
          source_captured_at: string | null
          source_provider: string | null
          source_record_id: string | null
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          client_ciphertext: string
          created_at?: string
          dek_salt: string
          description?: string | null
          encrypted_dek: string
          expires_at?: string | null
          id?: string
          label: string
          schema_type?: string
          source_captured_at?: string | null
          source_provider?: string | null
          source_record_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          client_ciphertext?: string
          created_at?: string
          dek_salt?: string
          description?: string | null
          encrypted_dek?: string
          expires_at?: string | null
          id?: string
          label?: string
          schema_type?: string
          source_captured_at?: string | null
          source_provider?: string | null
          source_record_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_data_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_field_monetization: {
        Row: {
          category: string
          created_at: string
          field_key: string
          id: string
          opted_in: boolean
          updated_at: string
          user_id: string
          vault_data_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          field_key: string
          id?: string
          opted_in?: boolean
          updated_at?: string
          user_id: string
          vault_data_id: string
        }
        Update: {
          category?: string
          created_at?: string
          field_key?: string
          id?: string
          opted_in?: boolean
          updated_at?: string
          user_id?: string
          vault_data_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_field_monetization_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_field_monetization_vault_data_id_fkey"
            columns: ["vault_data_id"]
            isOneToOne: false
            referencedRelation: "vault_data"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          event: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          response_status: number | null
          status: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          response_status?: number | null
          status?: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          event?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          response_status?: number | null
          status?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "org_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_consent_request_atomic: {
        Args: { request_id: string; response_note?: string }
        Returns: Json
      }
      claim_offer_atomic: {
        Args: { p_offer_id: string }
        Returns: {
          buyer_org_id: string
          created_at: string
          id: string
          incentive: string
          offer_id: string
          offer_title: string
          redeemed_at: string | null
          redemption_code: string
          status: string
          target_category: string
          user_id: string
          withdrawn_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "offer_claims"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      list_my_sessions: {
        Args: never
        Returns: {
          created_at: string
          id: string
          ip: string
          updated_at: string
          user_agent: string
        }[]
      }
      pool_field_coverage: {
        Args: { p_pool_id: string }
        Returns: {
          field: string
          present: number
        }[]
      }
      pool_freshness: {
        Args: { p_pool_id: string }
        Returns: {
          bucket: string
          records: number
        }[]
      }
      pool_schema_mix: {
        Args: { p_pool_id: string }
        Returns: {
          records: number
          schema_type: string
        }[]
      }
      redeem_offer_claim_atomic: {
        Args: { p_organization_id: string; p_redemption_code: string }
        Returns: {
          buyer_org_id: string
          created_at: string
          id: string
          incentive: string
          offer_id: string
          offer_title: string
          redeemed_at: string | null
          redemption_code: string
          status: string
          target_category: string
          user_id: string
          withdrawn_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "offer_claims"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      revoke_my_session: { Args: { p_session_id: string }; Returns: boolean }
      revoke_organization_api_key: {
        Args: { p_key_id: string }
        Returns: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          key_suffix: string | null
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "organization_api_keys"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rewrap_vault_entries_atomic: {
        Args: { entries: Json }
        Returns: undefined
      }
      rotate_organization_api_key: {
        Args: {
          p_key_hash: string
          p_key_suffix: string
          p_name?: string
          p_organization_id: string
        }
        Returns: {
          created_at: string
          expires_at: string | null
          id: string
          key_hash: string
          key_suffix: string | null
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "organization_api_keys"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      vault_source_coverage: {
        Args: { p_user_id: string }
        Returns: {
          first_captured_at: string
          last_captured_at: string
          provider: string
          record_count: number
        }[]
      }
      withdraw_offer_claim_atomic: {
        Args: { p_claim_id: string }
        Returns: {
          buyer_org_id: string
          created_at: string
          id: string
          incentive: string
          offer_id: string
          offer_title: string
          redeemed_at: string | null
          redemption_code: string
          status: string
          target_category: string
          user_id: string
          withdrawn_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "offer_claims"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

export type User = Database['public']['Tables']['users']['Row']
export type VaultData = Database['public']['Tables']['vault_data']['Row']
export type Consent = Database['public']['Tables']['consents']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']
export type Organization = Database['public']['Tables']['organizations']['Row']
export type OrganizationApiKey = Database['public']['Tables']['organization_api_keys']['Row']
export type InsertOrganizationApiKey = Database['public']['Tables']['organization_api_keys']['Insert']
export type UpdateOrganizationApiKey = Database['public']['Tables']['organization_api_keys']['Update']
export type ConsentRequest = Database['public']['Tables']['consent_requests']['Row']
export type ConsentReceipt = Database['public']['Tables']['consent_receipts']['Row']
export type InsertConsentReceipt = Database['public']['Tables']['consent_receipts']['Insert']
export type PlatformKey = Database['public']['Tables']['platform_keys']['Row']
export type JobRun = Database['public']['Tables']['job_runs']['Row']
export type Passkey = Database['public']['Tables']['passkeys']['Row']
export type OrgMember = Database['public']['Tables']['org_members']['Row']
export type IssuerKey = Database['public']['Tables']['issuer_keys']['Row']
export type IssuedCredential = Database['public']['Tables']['issued_credentials']['Row']
export type CredentialShare = Database['public']['Tables']['credential_shares']['Row']
export type CredentialRequest = Database['public']['Tables']['credential_requests']['Row']
export type InsertCredentialRequest = Database['public']['Tables']['credential_requests']['Insert']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type InsertNotification = Database['public']['Tables']['notifications']['Insert']
export type OrgSubscription = Database['public']['Tables']['org_subscriptions']['Row']
export type UsageEvent = Database['public']['Tables']['usage_events']['Row']
export type InsertVaultData = Database['public']['Tables']['vault_data']['Insert']
export type UpdateVaultData = Database['public']['Tables']['vault_data']['Update']
export type InsertConsent = Database['public']['Tables']['consents']['Insert']
export type UpdateConsent = Database['public']['Tables']['consents']['Update']
export type InsertAuditLog = Database['public']['Tables']['audit_logs']['Insert']
export type DataPool = Database['public']['Tables']['data_pools']['Row']
export type InsertDataPool = Database['public']['Tables']['data_pools']['Insert']
export type UpdateDataPool = Database['public']['Tables']['data_pools']['Update']
export type PoolContribution = Database['public']['Tables']['pool_contributions']['Row']
export type InsertPoolContribution = Database['public']['Tables']['pool_contributions']['Insert']
export type UpdatePoolContribution = Database['public']['Tables']['pool_contributions']['Update']
export type DataOrder = Database['public']['Tables']['data_orders']['Row']
export type InsertDataOrder = Database['public']['Tables']['data_orders']['Insert']
export type UpdateDataOrder = Database['public']['Tables']['data_orders']['Update']
export type DataOrderRecord = Database['public']['Tables']['data_order_records']['Row']
export type InsertDataOrderRecord = Database['public']['Tables']['data_order_records']['Insert']
export type UpdateDataOrderRecord = Database['public']['Tables']['data_order_records']['Update']
export type PayoutAccount = Database['public']['Tables']['payout_accounts']['Row']
export type InsertPayoutAccount = Database['public']['Tables']['payout_accounts']['Insert']
export type UpdatePayoutAccount = Database['public']['Tables']['payout_accounts']['Update']
export type Payout = Database['public']['Tables']['payouts']['Row']
export type InsertPayout = Database['public']['Tables']['payouts']['Insert']
export type UpdatePayout = Database['public']['Tables']['payouts']['Update']
export type MfaBackupCode = Database['public']['Tables']['mfa_backup_codes']['Row']
export type InsertMfaBackupCode = Database['public']['Tables']['mfa_backup_codes']['Insert']
export type VaultFieldMonetization = Database['public']['Tables']['vault_field_monetization']['Row']
export type InsertVaultFieldMonetization = Database['public']['Tables']['vault_field_monetization']['Insert']
export type UpdateVaultFieldMonetization = Database['public']['Tables']['vault_field_monetization']['Update']
export type SalePreferences = Database['public']['Tables']['sale_preferences']['Row']
export type InsertSalePreferences = Database['public']['Tables']['sale_preferences']['Insert']
export type UpdateSalePreferences = Database['public']['Tables']['sale_preferences']['Update']
export type Offer = Database['public']['Tables']['offers']['Row']
export type InsertOffer = Database['public']['Tables']['offers']['Insert']
export type UpdateOffer = Database['public']['Tables']['offers']['Update']
export type OfferClaim = Database['public']['Tables']['offer_claims']['Row']
export type InsertOfferClaim = Database['public']['Tables']['offer_claims']['Insert']

export type RightsCase = Database['public']['Tables']['rights_cases']['Row']
export type InsertRightsCase = Database['public']['Tables']['rights_cases']['Insert']
export type RightsCaseEvent = Database['public']['Tables']['rights_case_events']['Row']
export type BulkJob = Database['public']['Tables']['bulk_jobs']['Row']
export type BulkJobRow = Database['public']['Tables']['bulk_job_rows']['Row']
export type DataSource = Database['public']['Tables']['data_sources']['Row']
export type PendingIngest = Database['public']['Tables']['pending_ingest']['Row']
