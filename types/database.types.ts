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
          filters: Json | null
          id: string
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
          filters?: Json | null
          id?: string
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
          filters?: Json | null
          id?: string
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
          created_at: string
          encrypted_private_key: string
          id: string
          key_id: string
          organization_id: string
          private_key_iv: string
          public_key: string
          revoked_at: string | null
          status: string
        }
        Insert: {
          alg?: string
          created_at?: string
          encrypted_private_key: string
          id?: string
          key_id: string
          organization_id: string
          private_key_iv: string
          public_key: string
          revoked_at?: string | null
          status?: string
        }
        Update: {
          alg?: string
          created_at?: string
          encrypted_private_key?: string
          id?: string
          key_id?: string
          organization_id?: string
          private_key_iv?: string
          public_key?: string
          revoked_at?: string | null
          status?: string
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
          contribution_id: string | null
          created_at: string
          data_order_id: string | null
          id: string
          pool_id: string | null
          status: string
          stripe_transfer_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          contribution_id?: string | null
          created_at?: string
          data_order_id?: string | null
          id?: string
          pool_id?: string | null
          status?: string
          stripe_transfer_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          contribution_id?: string | null
          created_at?: string
          data_order_id?: string | null
          id?: string
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
          pool_id: string
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
          pool_id: string
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
          pool_id?: string
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
          key_hint: string | null
          key_salt: string | null
          onboarding_completed: boolean
          recovery_code_salt: string | null
          recovery_codes_generated_at: string | null
          updated_at: string
          wrapped_master_key: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          email_notifications_enabled?: boolean
          id: string
          key_hint?: string | null
          key_salt?: string | null
          onboarding_completed?: boolean
          recovery_code_salt?: string | null
          recovery_codes_generated_at?: string | null
          updated_at?: string
          wrapped_master_key?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          email_notifications_enabled?: boolean
          id?: string
          key_hint?: string | null
          key_salt?: string | null
          onboarding_completed?: boolean
          recovery_code_salt?: string | null
          recovery_codes_generated_at?: string | null
          updated_at?: string
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


// Application aliases

export type User = Database['public']['Tables']['users']['Row']
export type VaultData = Database['public']['Tables']['vault_data']['Row']
export type Consent = Database['public']['Tables']['consents']['Row']
export type AuditLog = Database['public']['Tables']['audit_logs']['Row']
export type Organization = Database['public']['Tables']['organizations']['Row']
export type OrganizationApiKey = Database['public']['Tables']['organization_api_keys']['Row']
export type InsertOrganizationApiKey = Database['public']['Tables']['organization_api_keys']['Insert']
export type UpdateOrganizationApiKey = Database['public']['Tables']['organization_api_keys']['Update']
export type ConsentRequest = Database['public']['Tables']['consent_requests']['Row']
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

