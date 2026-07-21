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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          bank_name: string | null
          cancel_reason: string | null
          card_number: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          holder_customer_id: string | null
          holder_name: string | null
          holder_person_name: string | null
          holder_type: Database["public"]["Enums"]["holder_type"] | null
          iban: string | null
          id: string
          is_active: boolean
          low_balance_threshold: number | null
          name: string
          node_type: Database["public"]["Enums"]["account_node_type"]
          notes: string | null
          opening_balance: number
          owner: Database["public"]["Enums"]["account_owner"]
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          bank_name?: string | null
          cancel_reason?: string | null
          card_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          holder_customer_id?: string | null
          holder_name?: string | null
          holder_person_name?: string | null
          holder_type?: Database["public"]["Enums"]["holder_type"] | null
          iban?: string | null
          id?: string
          is_active?: boolean
          low_balance_threshold?: number | null
          name: string
          node_type?: Database["public"]["Enums"]["account_node_type"]
          notes?: string | null
          opening_balance?: number
          owner?: Database["public"]["Enums"]["account_owner"]
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["account_type"]
          bank_name?: string | null
          cancel_reason?: string | null
          card_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          holder_customer_id?: string | null
          holder_name?: string | null
          holder_person_name?: string | null
          holder_type?: Database["public"]["Enums"]["holder_type"] | null
          iban?: string | null
          id?: string
          is_active?: boolean
          low_balance_threshold?: number | null
          name?: string
          node_type?: Database["public"]["Enums"]["account_node_type"]
          notes?: string | null
          opening_balance?: number
          owner?: Database["public"]["Enums"]["account_owner"]
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_holder_customer_id_fkey"
            columns: ["holder_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      app_feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          alert_drop_pct_15min: number
          alert_near_cost_pct: number
          alert_rise_pct_15min: number
          alert_stale_minutes: number
          alert_volatility_pct_1h: number
          id: boolean
          market_rate_manual_fallback: boolean
          market_rate_refresh_minutes: number
          market_rate_source: string
          profit_recognition_method: string
          updated_at: string
        }
        Insert: {
          alert_drop_pct_15min?: number
          alert_near_cost_pct?: number
          alert_rise_pct_15min?: number
          alert_stale_minutes?: number
          alert_volatility_pct_1h?: number
          id?: boolean
          market_rate_manual_fallback?: boolean
          market_rate_refresh_minutes?: number
          market_rate_source?: string
          profit_recognition_method?: string
          updated_at?: string
        }
        Update: {
          alert_drop_pct_15min?: number
          alert_near_cost_pct?: number
          alert_rise_pct_15min?: number
          alert_stale_minutes?: number
          alert_volatility_pct_1h?: number
          id?: boolean
          market_rate_manual_fallback?: boolean
          market_rate_refresh_minutes?: number
          market_rate_source?: string
          profit_recognition_method?: string
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          device: string | null
          entity_id: string
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          device?: string | null
          entity_id: string
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json | null
          id: string
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      brought_in_money: {
        Row: {
          amount: number
          attachment_url: string | null
          brought_by: Database["public"]["Enums"]["brought_in_by"]
          cancel_reason: string | null
          conversion_fee_amount: number | null
          conversion_fee_currency: string | null
          conversion_fee_kind: string | null
          conversion_rate: number | null
          convert_enabled: boolean
          converted_amount: number | null
          converted_currency: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deposit_account_id: string
          doc_no: string | null
          entry_date: string
          final_deposit_account_id: string | null
          id: string
          notes: string | null
          rate_difference: number | null
          rate_difference_percent: number | null
          reason: Database["public"]["Enums"]["brought_in_reason"]
          reference_buy_rate: number | null
          reference_currency: string | null
          reference_mid_rate: number | null
          reference_rate_source: string | null
          reference_rate_time: string | null
          reference_sell_rate: number | null
          sender_account_name: string | null
          sender_account_number: string | null
          sender_bank_name: string | null
          source_location_label: string | null
          source_name: string | null
          status: string
          transaction_rate: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          brought_by: Database["public"]["Enums"]["brought_in_by"]
          cancel_reason?: string | null
          conversion_fee_amount?: number | null
          conversion_fee_currency?: string | null
          conversion_fee_kind?: string | null
          conversion_rate?: number | null
          convert_enabled?: boolean
          converted_amount?: number | null
          converted_currency?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          deposit_account_id: string
          doc_no?: string | null
          entry_date?: string
          final_deposit_account_id?: string | null
          id?: string
          notes?: string | null
          rate_difference?: number | null
          rate_difference_percent?: number | null
          reason?: Database["public"]["Enums"]["brought_in_reason"]
          reference_buy_rate?: number | null
          reference_currency?: string | null
          reference_mid_rate?: number | null
          reference_rate_source?: string | null
          reference_rate_time?: string | null
          reference_sell_rate?: number | null
          sender_account_name?: string | null
          sender_account_number?: string | null
          sender_bank_name?: string | null
          source_location_label?: string | null
          source_name?: string | null
          status?: string
          transaction_rate?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          brought_by?: Database["public"]["Enums"]["brought_in_by"]
          cancel_reason?: string | null
          conversion_fee_amount?: number | null
          conversion_fee_currency?: string | null
          conversion_fee_kind?: string | null
          conversion_rate?: number | null
          convert_enabled?: boolean
          converted_amount?: number | null
          converted_currency?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deposit_account_id?: string
          doc_no?: string | null
          entry_date?: string
          final_deposit_account_id?: string | null
          id?: string
          notes?: string | null
          rate_difference?: number | null
          rate_difference_percent?: number | null
          reason?: Database["public"]["Enums"]["brought_in_reason"]
          reference_buy_rate?: number | null
          reference_currency?: string | null
          reference_mid_rate?: number | null
          reference_rate_source?: string | null
          reference_rate_time?: string | null
          reference_sell_rate?: number | null
          sender_account_name?: string | null
          sender_account_number?: string | null
          sender_bank_name?: string | null
          source_location_label?: string | null
          source_name?: string | null
          status?: string
          transaction_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brought_in_money_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "brought_in_money_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brought_in_money_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "brought_in_money_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "brought_in_money_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "brought_in_money_final_deposit_account_id_fkey"
            columns: ["final_deposit_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "brought_in_money_final_deposit_account_id_fkey"
            columns: ["final_deposit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brought_in_money_final_deposit_account_id_fkey"
            columns: ["final_deposit_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "brought_in_money_final_deposit_account_id_fkey"
            columns: ["final_deposit_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "brought_in_money_final_deposit_account_id_fkey"
            columns: ["final_deposit_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      buy_transactions: {
        Row: {
          attachment_url: string | null
          bought_amount: number
          bought_currency: string
          buy_rate: number
          cancel_reason: string | null
          completion_note: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          currency_holder_type:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_id: string | null
          deleted_at: string | null
          doc_no: string | null
          due_date: string | null
          entry_date: string
          id: string
          money_holder_type: Database["public"]["Enums"]["holder_type"] | null
          money_location: Database["public"]["Enums"]["money_location"] | null
          notes: string | null
          paid_amount: number
          paid_currency: string
          paid_from_account_id: string | null
          rate_difference: number | null
          rate_difference_percent: number | null
          received_into_account_id: string | null
          reference_buy_rate: number | null
          reference_currency: string | null
          reference_mid_rate: number | null
          reference_rate_source: string | null
          reference_rate_time: string | null
          reference_sell_rate: number | null
          settled_by_remittance_id: string | null
          settlement_source: Database["public"]["Enums"]["buy_settlement_source"]
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          supplier_delivered: boolean
          supplier_delivered_at: string | null
          supplier_delivery_note: string | null
          supplier_settled_amount: number
          trade_cycle_id: string | null
          transaction_rate: number | null
          txn_owner: Database["public"]["Enums"]["txn_owner"]
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          bought_amount: number
          bought_currency: string
          buy_rate: number
          cancel_reason?: string | null
          completion_note?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency_holder_type?:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_id?: string | null
          deleted_at?: string | null
          doc_no?: string | null
          due_date?: string | null
          entry_date?: string
          id?: string
          money_holder_type?: Database["public"]["Enums"]["holder_type"] | null
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_amount: number
          paid_currency: string
          paid_from_account_id?: string | null
          rate_difference?: number | null
          rate_difference_percent?: number | null
          received_into_account_id?: string | null
          reference_buy_rate?: number | null
          reference_currency?: string | null
          reference_mid_rate?: number | null
          reference_rate_source?: string | null
          reference_rate_time?: string | null
          reference_sell_rate?: number | null
          settled_by_remittance_id?: string | null
          settlement_source?: Database["public"]["Enums"]["buy_settlement_source"]
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          supplier_delivered?: boolean
          supplier_delivered_at?: string | null
          supplier_delivery_note?: string | null
          supplier_settled_amount?: number
          trade_cycle_id?: string | null
          transaction_rate?: number | null
          txn_owner?: Database["public"]["Enums"]["txn_owner"]
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          bought_amount?: number
          bought_currency?: string
          buy_rate?: number
          cancel_reason?: string | null
          completion_note?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency_holder_type?:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_id?: string | null
          deleted_at?: string | null
          doc_no?: string | null
          due_date?: string | null
          entry_date?: string
          id?: string
          money_holder_type?: Database["public"]["Enums"]["holder_type"] | null
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_amount?: number
          paid_currency?: string
          paid_from_account_id?: string | null
          rate_difference?: number | null
          rate_difference_percent?: number | null
          received_into_account_id?: string | null
          reference_buy_rate?: number | null
          reference_currency?: string | null
          reference_mid_rate?: number | null
          reference_rate_source?: string | null
          reference_rate_time?: string | null
          reference_sell_rate?: number | null
          settled_by_remittance_id?: string | null
          settlement_source?: Database["public"]["Enums"]["buy_settlement_source"]
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          supplier_delivered?: boolean
          supplier_delivered_at?: string | null
          supplier_delivery_note?: string | null
          supplier_settled_amount?: number
          trade_cycle_id?: string | null
          transaction_rate?: number | null
          txn_owner?: Database["public"]["Enums"]["txn_owner"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buy_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_transactions_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buy_transactions_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_transactions_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buy_transactions_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buy_transactions_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buy_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buy_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buy_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buy_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "buy_transactions_settled_by_remittance_id_fkey"
            columns: ["settled_by_remittance_id"]
            isOneToOne: false
            referencedRelation: "remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_transactions_settled_by_remittance_id_fkey"
            columns: ["settled_by_remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_migration_diff"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "buy_transactions_settled_by_remittance_id_fkey"
            columns: ["settled_by_remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "buy_transactions_trade_cycle_id_fkey"
            columns: ["trade_cycle_id"]
            isOneToOne: false
            referencedRelation: "trade_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buy_transactions_trade_cycle_id_fkey"
            columns: ["trade_cycle_id"]
            isOneToOne: false
            referencedRelation: "v_open_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          bank_name: string
          cancel_reason: string | null
          card_number: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          deleted_at: string | null
          holder_name: string | null
          iban: string | null
          id: string
          is_active: boolean
          is_default: boolean
          last_used_at: string | null
          nickname: string | null
          notes: string | null
          phone: string | null
          sort_code: string | null
          swift_bic: string | null
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          bank_name: string
          cancel_reason?: string | null
          card_number?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          customer_id: string
          deleted_at?: string | null
          holder_name?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_used_at?: string | null
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          sort_code?: string | null
          swift_bic?: string | null
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          bank_name?: string
          cancel_reason?: string | null
          card_number?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          deleted_at?: string | null
          holder_name?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          last_used_at?: string | null
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          sort_code?: string | null
          swift_bic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_bank_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit: {
        Row: {
          base_currency: string
          created_at: string
          credit_limit: number
          customer_id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          credit_limit?: number
          customer_id: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          credit_limit?: number
          customer_id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_deposits: {
        Row: {
          amount: number
          cancel_reason: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          deleted_at: string | null
          deposit_account_id: string
          entry_date: string
          id: string
          money_location: Database["public"]["Enums"]["money_location"] | null
          notes: string | null
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          updated_at: string
          wallet_account_id: string
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          customer_id: string
          deleted_at?: string | null
          deposit_account_id: string
          entry_date?: string
          id?: string
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          updated_at?: string
          wallet_account_id: string
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          deleted_at?: string | null
          deposit_account_id?: string
          entry_date?: string
          id?: string
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          updated_at?: string
          wallet_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customer_deposits_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customer_deposits_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customer_deposits_deposit_account_id_fkey"
            columns: ["deposit_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customer_deposits_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customer_deposits_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_deposits_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customer_deposits_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "customer_deposits_wallet_account_id_fkey"
            columns: ["wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      customers: {
        Row: {
          account_details: string | null
          cancel_reason: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          account_details?: string | null
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          account_details?: string | null
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      daily_closings: {
        Row: {
          closed_by: string | null
          closing_date: string
          created_at: string
          id: string
          is_locked: boolean
          notes: string | null
          snapshot: Json
          updated_at: string
        }
        Insert: {
          closed_by?: string | null
          closing_date: string
          created_at?: string
          id?: string
          is_locked?: boolean
          notes?: string | null
          snapshot: Json
          updated_at?: string
        }
        Update: {
          closed_by?: string | null
          closing_date?: string
          created_at?: string
          id?: string
          is_locked?: boolean
          notes?: string | null
          snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      doc_counters: {
        Row: {
          next_val: number
          prefix: string
          year: number
        }
        Insert: {
          next_val?: number
          prefix: string
          year: number
        }
        Update: {
          next_val?: number
          prefix?: string
          year?: number
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_name: string
          id: string
          mime_type: string | null
          notes: string | null
          ref_id: string | null
          ref_type: string
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          doc_type: Database["public"]["Enums"]["doc_type"]
          file_name: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          ref_id?: string | null
          ref_type: string
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          doc_type?: Database["public"]["Enums"]["doc_type"]
          file_name?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          ref_id?: string | null
          ref_type?: string
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          attachment_url: string | null
          cancel_reason: string | null
          category: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          doc_no: string | null
          entry_date: string
          expense_kind: Database["public"]["Enums"]["expense_kind"] | null
          id: string
          is_business: boolean
          money_location: Database["public"]["Enums"]["money_location"] | null
          notes: string | null
          paid_by: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id: string
          receipt_required: boolean
          reduce_cycle_profit: boolean
          reduces_profit: boolean
          related_buy_id: string | null
          related_person: string | null
          related_ref_id: string | null
          related_ref_type: string | null
          related_sell_id: string | null
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          trade_cycle_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          cancel_reason?: string | null
          category?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          doc_no?: string | null
          entry_date?: string
          expense_kind?: Database["public"]["Enums"]["expense_kind"] | null
          id?: string
          is_business?: boolean
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_by: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id: string
          receipt_required?: boolean
          reduce_cycle_profit?: boolean
          reduces_profit?: boolean
          related_buy_id?: string | null
          related_person?: string | null
          related_ref_id?: string | null
          related_ref_type?: string | null
          related_sell_id?: string | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          trade_cycle_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          cancel_reason?: string | null
          category?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          doc_no?: string | null
          entry_date?: string
          expense_kind?: Database["public"]["Enums"]["expense_kind"] | null
          id?: string
          is_business?: boolean
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_by?: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id?: string
          receipt_required?: boolean
          reduce_cycle_profit?: boolean
          reduces_profit?: boolean
          related_buy_id?: string | null
          related_person?: string | null
          related_ref_id?: string | null
          related_ref_type?: string | null
          related_sell_id?: string | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          trade_cycle_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expenses_related_buy_id_fkey"
            columns: ["related_buy_id"]
            isOneToOne: false
            referencedRelation: "buy_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_related_buy_id_fkey"
            columns: ["related_buy_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["linked_buy_id"]
          },
          {
            foreignKeyName: "expenses_related_sell_id_fkey"
            columns: ["related_sell_id"]
            isOneToOne: false
            referencedRelation: "sale_allocations_view"
            referencedColumns: ["sell_id"]
          },
          {
            foreignKeyName: "expenses_related_sell_id_fkey"
            columns: ["related_sell_id"]
            isOneToOne: false
            referencedRelation: "sell_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trade_cycle_id_fkey"
            columns: ["trade_cycle_id"]
            isOneToOne: false
            referencedRelation: "trade_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trade_cycle_id_fkey"
            columns: ["trade_cycle_id"]
            isOneToOne: false
            referencedRelation: "v_open_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          account_id: string | null
          cost_basis_currency: string
          cost_basis_rate: number
          cost_basis_status: string
          created_at: string
          created_by: string | null
          currency: string
          entry_date: string
          id: string
          lot_code: string | null
          notes: string | null
          original_amount: number
          remaining_amount: number
          source_description: string | null
          source_ref_id: string | null
          source_ref_type: string
          status: Database["public"]["Enums"]["inventory_lot_status"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          cost_basis_currency: string
          cost_basis_rate: number
          cost_basis_status?: string
          created_at?: string
          created_by?: string | null
          currency: string
          entry_date?: string
          id?: string
          lot_code?: string | null
          notes?: string | null
          original_amount: number
          remaining_amount: number
          source_description?: string | null
          source_ref_id?: string | null
          source_ref_type: string
          status?: Database["public"]["Enums"]["inventory_lot_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          cost_basis_currency?: string
          cost_basis_rate?: number
          cost_basis_status?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_date?: string
          id?: string
          lot_code?: string | null
          notes?: string | null
          original_amount?: number
          remaining_amount?: number
          source_description?: string | null
          source_ref_id?: string | null
          source_ref_type?: string
          status?: Database["public"]["Enums"]["inventory_lot_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency: string
          description: string | null
          entry_date: string
          id: string
          ref_id: string | null
          ref_type: Database["public"]["Enums"]["ledger_ref_type"]
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency: string
          description?: string | null
          entry_date?: string
          id?: string
          ref_id?: string | null
          ref_type: Database["public"]["Enums"]["ledger_ref_type"]
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          entry_date?: string
          id?: string
          ref_id?: string | null
          ref_type?: Database["public"]["Enums"]["ledger_ref_type"]
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      lot_consumptions: {
        Row: {
          amount: number
          cost_amount: number
          cost_basis_currency: string
          cost_rate: number
          created_at: string
          currency: string
          entry_date: string
          id: string
          lot_id: string
          sell_ref_id: string
          sell_ref_type: string
        }
        Insert: {
          amount: number
          cost_amount: number
          cost_basis_currency: string
          cost_rate: number
          created_at?: string
          currency: string
          entry_date?: string
          id?: string
          lot_id: string
          sell_ref_id: string
          sell_ref_type: string
        }
        Update: {
          amount?: number
          cost_amount?: number
          cost_basis_currency?: string
          cost_rate?: number
          created_at?: string
          currency?: string
          entry_date?: string
          id?: string
          lot_id?: string
          sell_ref_id?: string
          sell_ref_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_consumptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_consumptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_consumptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "profit_by_lot"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "lot_consumptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_lot_detailed"
            referencedColumns: ["id"]
          },
        ]
      }
      market_notifications: {
        Row: {
          body: string | null
          created_at: string
          currency: string | null
          id: string
          kind: string
          metadata: Json | null
          read_at: string | null
          ref_id: string | null
          ref_type: string | null
          severity: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          read_at?: string | null
          ref_id?: string | null
          ref_type?: string | null
          severity?: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          read_at?: string | null
          ref_id?: string | null
          ref_type?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      market_rate_fetches: {
        Row: {
          currencies: Json | null
          duration_ms: number | null
          error_message: string | null
          failed_count: number
          finished_at: string | null
          id: string
          source: string
          started_at: string
          success_count: number
          triggered_by: string | null
        }
        Insert: {
          currencies?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          source?: string
          started_at?: string
          success_count?: number
          triggered_by?: string | null
        }
        Update: {
          currencies?: Json | null
          duration_ms?: number | null
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          source?: string
          started_at?: string
          success_count?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      market_rates: {
        Row: {
          buy_rate: number | null
          created_at: string
          currency: string
          error_message: string | null
          fetched_at: string
          id: string
          mid_rate: number | null
          raw_response: Json | null
          sell_rate: number | null
          source: string
          source_buy_rate: number | null
          source_mid_rate: number | null
          source_sell_rate: number | null
          source_unit: string | null
          status: string
        }
        Insert: {
          buy_rate?: number | null
          created_at?: string
          currency: string
          error_message?: string | null
          fetched_at?: string
          id?: string
          mid_rate?: number | null
          raw_response?: Json | null
          sell_rate?: number | null
          source?: string
          source_buy_rate?: number | null
          source_mid_rate?: number | null
          source_sell_rate?: number | null
          source_unit?: string | null
          status?: string
        }
        Update: {
          buy_rate?: number | null
          created_at?: string
          currency?: string
          error_message?: string | null
          fetched_at?: string
          id?: string
          mid_rate?: number | null
          raw_response?: Json | null
          sell_rate?: number | null
          source?: string
          source_buy_rate?: number | null
          source_mid_rate?: number | null
          source_sell_rate?: number | null
          source_unit?: string | null
          status?: string
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          amount: number
          cancel_reason: string | null
          completion_note: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          deleted_at: string | null
          destination_bank: string | null
          destination_bank_name: string | null
          entry_date: string
          fee_input: number | null
          fee_kind: Database["public"]["Enums"]["fee_kind"]
          iban_card: string | null
          id: string
          is_free_service: boolean
          method: Database["public"]["Enums"]["payment_method"]
          money_location: Database["public"]["Enums"]["money_location"] | null
          notes: string | null
          paid_from_account_id: string | null
          receiver_account: string | null
          receiver_iban: string | null
          receiver_name: string | null
          service_charge_amount: number
          service_charge_currency: string | null
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          source_wallet_account_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          completion_note?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          customer_id: string
          deleted_at?: string | null
          destination_bank?: string | null
          destination_bank_name?: string | null
          entry_date?: string
          fee_input?: number | null
          fee_kind?: Database["public"]["Enums"]["fee_kind"]
          iban_card?: string | null
          id?: string
          is_free_service?: boolean
          method: Database["public"]["Enums"]["payment_method"]
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_from_account_id?: string | null
          receiver_account?: string | null
          receiver_iban?: string | null
          receiver_name?: string | null
          service_charge_amount?: number
          service_charge_currency?: string | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          source_wallet_account_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          completion_note?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          deleted_at?: string | null
          destination_bank?: string | null
          destination_bank_name?: string | null
          entry_date?: string
          fee_input?: number | null
          fee_kind?: Database["public"]["Enums"]["fee_kind"]
          iban_card?: string | null
          id?: string
          is_free_service?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_from_account_id?: string | null
          receiver_account?: string | null
          receiver_iban?: string | null
          receiver_name?: string | null
          service_charge_amount?: number
          service_charge_currency?: string | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          source_wallet_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payment_orders_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payment_orders_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payment_orders_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payment_orders_source_wallet_account_id_fkey"
            columns: ["source_wallet_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payment_orders_source_wallet_account_id_fkey"
            columns: ["source_wallet_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_source_wallet_account_id_fkey"
            columns: ["source_wallet_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payment_orders_source_wallet_account_id_fkey"
            columns: ["source_wallet_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payment_orders_source_wallet_account_id_fkey"
            columns: ["source_wallet_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profit_receivables: {
        Row: {
          amount: number
          cancel_reason: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          received_at: string | null
          received_into_account_id: string | null
          status: string
          trade_cycle_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_into_account_id?: string | null
          status?: string
          trade_cycle_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          received_at?: string | null
          received_into_account_id?: string | null
          status?: string
          trade_cycle_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_receivables_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_receivables_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profit_receivables_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_receivables_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profit_receivables_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profit_receivables_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "profit_receivables_trade_cycle_id_fkey"
            columns: ["trade_cycle_id"]
            isOneToOne: false
            referencedRelation: "trade_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profit_receivables_trade_cycle_id_fkey"
            columns: ["trade_cycle_id"]
            isOneToOne: false
            referencedRelation: "v_open_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      remittance_allocations: {
        Row: {
          allocated_amount: number
          buy_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          entry_kind: Database["public"]["Enums"]["entry_kind"]
          frozen_at: string | null
          frozen_by: string | null
          frozen_commission_aed: number | null
          frozen_cost_amount: number | null
          frozen_cost_currency: string | null
          frozen_snapshot: Json | null
          frozen_spread_profit_aed: number | null
          frozen_total_profit_aed: number | null
          id: string
          lot_id: string | null
          notes: string | null
          parent_allocation_id: string | null
          posting_class: Database["public"]["Enums"]["posting_class"]
          remittance_id: string
          reversed_by_id: string | null
          status: Database["public"]["Enums"]["allocation_status"]
          updated_at: string
          workflow_version: Database["public"]["Enums"]["workflow_version"]
        }
        Insert: {
          allocated_amount: number
          buy_id?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          entry_kind?: Database["public"]["Enums"]["entry_kind"]
          frozen_at?: string | null
          frozen_by?: string | null
          frozen_commission_aed?: number | null
          frozen_cost_amount?: number | null
          frozen_cost_currency?: string | null
          frozen_snapshot?: Json | null
          frozen_spread_profit_aed?: number | null
          frozen_total_profit_aed?: number | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          parent_allocation_id?: string | null
          posting_class?: Database["public"]["Enums"]["posting_class"]
          remittance_id: string
          reversed_by_id?: string | null
          status?: Database["public"]["Enums"]["allocation_status"]
          updated_at?: string
          workflow_version?: Database["public"]["Enums"]["workflow_version"]
        }
        Update: {
          allocated_amount?: number
          buy_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_kind?: Database["public"]["Enums"]["entry_kind"]
          frozen_at?: string | null
          frozen_by?: string | null
          frozen_commission_aed?: number | null
          frozen_cost_amount?: number | null
          frozen_cost_currency?: string | null
          frozen_snapshot?: Json | null
          frozen_spread_profit_aed?: number | null
          frozen_total_profit_aed?: number | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          parent_allocation_id?: string | null
          posting_class?: Database["public"]["Enums"]["posting_class"]
          remittance_id?: string
          reversed_by_id?: string | null
          status?: Database["public"]["Enums"]["allocation_status"]
          updated_at?: string
          workflow_version?: Database["public"]["Enums"]["workflow_version"]
        }
        Relationships: [
          {
            foreignKeyName: "remittance_allocations_buy_id_fkey"
            columns: ["buy_id"]
            isOneToOne: false
            referencedRelation: "buy_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_allocations_buy_id_fkey"
            columns: ["buy_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["linked_buy_id"]
          },
          {
            foreignKeyName: "remittance_allocations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_allocations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "inventory_lots_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_allocations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "profit_by_lot"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "remittance_allocations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "v_lot_detailed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_allocations_parent_allocation_id_fkey"
            columns: ["parent_allocation_id"]
            isOneToOne: false
            referencedRelation: "remittance_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_allocations_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_allocations_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_migration_diff"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "remittance_allocations_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "remittance_allocations_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "remittance_allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      remittance_expenses: {
        Row: {
          amount: number
          amount_aed: number
          created_at: string
          currency: string
          id: string
          label: string
          notes: string | null
          remittance_id: string
        }
        Insert: {
          amount: number
          amount_aed?: number
          created_at?: string
          currency?: string
          id?: string
          label: string
          notes?: string | null
          remittance_id: string
        }
        Update: {
          amount?: number
          amount_aed?: number
          created_at?: string
          currency?: string
          id?: string
          label?: string
          notes?: string | null
          remittance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remittance_expenses_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_expenses_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_migration_diff"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "remittance_expenses_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["remittance_id"]
          },
        ]
      }
      remittance_migration_audit: {
        Row: {
          actual_amount: number | null
          allocation_id: string | null
          batch_id: string
          created_at: string
          details: Json | null
          diff_category: Database["public"]["Enums"]["migration_diff_category"]
          expected_amount: number | null
          expected_currency: string | null
          id: string
          linked_buy_id: string | null
          remittance_id: string
        }
        Insert: {
          actual_amount?: number | null
          allocation_id?: string | null
          batch_id: string
          created_at?: string
          details?: Json | null
          diff_category: Database["public"]["Enums"]["migration_diff_category"]
          expected_amount?: number | null
          expected_currency?: string | null
          id?: string
          linked_buy_id?: string | null
          remittance_id: string
        }
        Update: {
          actual_amount?: number | null
          allocation_id?: string | null
          batch_id?: string
          created_at?: string
          details?: Json | null
          diff_category?: Database["public"]["Enums"]["migration_diff_category"]
          expected_amount?: number | null
          expected_currency?: string | null
          id?: string
          linked_buy_id?: string | null
          remittance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remittance_migration_audit_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "remittance_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_migration_audit_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "remittance_migration_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_migration_audit_linked_buy_id_fkey"
            columns: ["linked_buy_id"]
            isOneToOne: false
            referencedRelation: "buy_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_migration_audit_linked_buy_id_fkey"
            columns: ["linked_buy_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["linked_buy_id"]
          },
          {
            foreignKeyName: "remittance_migration_audit_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_migration_audit_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_migration_diff"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "remittance_migration_audit_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["remittance_id"]
          },
        ]
      }
      remittance_migration_batches: {
        Row: {
          eligible_count: number
          error_count: number
          finished_at: string | null
          id: string
          inserted_count: number
          is_dry_run: boolean
          note: string | null
          run_by: string | null
          skipped_count: number
          started_at: string
        }
        Insert: {
          eligible_count?: number
          error_count?: number
          finished_at?: string | null
          id?: string
          inserted_count?: number
          is_dry_run?: boolean
          note?: string | null
          run_by?: string | null
          skipped_count?: number
          started_at?: string
        }
        Update: {
          eligible_count?: number
          error_count?: number
          finished_at?: string | null
          id?: string
          inserted_count?: number
          is_dry_run?: boolean
          note?: string | null
          run_by?: string | null
          skipped_count?: number
          started_at?: string
        }
        Relationships: []
      }
      remittance_profit_components: {
        Row: {
          allocation_id: string | null
          amount: number
          amount_aed: number | null
          component_type: string
          created_at: string
          currency: string
          entry_kind: Database["public"]["Enums"]["entry_kind"]
          id: string
          posting_class: Database["public"]["Enums"]["posting_class"]
          reference_note: string | null
          remittance_id: string
          workflow_version: Database["public"]["Enums"]["workflow_version"]
        }
        Insert: {
          allocation_id?: string | null
          amount: number
          amount_aed?: number | null
          component_type: string
          created_at?: string
          currency: string
          entry_kind?: Database["public"]["Enums"]["entry_kind"]
          id?: string
          posting_class?: Database["public"]["Enums"]["posting_class"]
          reference_note?: string | null
          remittance_id: string
          workflow_version?: Database["public"]["Enums"]["workflow_version"]
        }
        Update: {
          allocation_id?: string | null
          amount?: number
          amount_aed?: number | null
          component_type?: string
          created_at?: string
          currency?: string
          entry_kind?: Database["public"]["Enums"]["entry_kind"]
          id?: string
          posting_class?: Database["public"]["Enums"]["posting_class"]
          reference_note?: string | null
          remittance_id?: string
          workflow_version?: Database["public"]["Enums"]["workflow_version"]
        }
        Relationships: [
          {
            foreignKeyName: "remittance_profit_components_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "remittance_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_profit_components_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_profit_components_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_migration_diff"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "remittance_profit_components_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["remittance_id"]
          },
        ]
      }
      remittance_settlement_events: {
        Row: {
          actor: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          remittance_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          remittance_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          remittance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remittance_settlement_events_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_settlement_events_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_migration_diff"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "remittance_settlement_events_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["remittance_id"]
          },
        ]
      }
      remittance_workflow_transitions: {
        Row: {
          actor: string | null
          created_at: string
          from_state:
            | Database["public"]["Enums"]["remittance_workflow_state"]
            | null
          id: string
          reason: string | null
          remittance_id: string
          to_state: Database["public"]["Enums"]["remittance_workflow_state"]
        }
        Insert: {
          actor?: string | null
          created_at?: string
          from_state?:
            | Database["public"]["Enums"]["remittance_workflow_state"]
            | null
          id?: string
          reason?: string | null
          remittance_id: string
          to_state: Database["public"]["Enums"]["remittance_workflow_state"]
        }
        Update: {
          actor?: string | null
          created_at?: string
          from_state?:
            | Database["public"]["Enums"]["remittance_workflow_state"]
            | null
          id?: string
          reason?: string | null
          remittance_id?: string
          to_state?: Database["public"]["Enums"]["remittance_workflow_state"]
        }
        Relationships: [
          {
            foreignKeyName: "remittance_workflow_transitions_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "remittances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittance_workflow_transitions_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_migration_diff"
            referencedColumns: ["remittance_id"]
          },
          {
            foreignKeyName: "remittance_workflow_transitions_remittance_id_fkey"
            columns: ["remittance_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["remittance_id"]
          },
        ]
      }
      remittances: {
        Row: {
          beneficiary_account_number: string | null
          beneficiary_bank: string | null
          beneficiary_card_number: string | null
          beneficiary_country: string | null
          beneficiary_iban: string | null
          beneficiary_name: string | null
          beneficiary_notes: string | null
          commission_fixed_amount: number | null
          commission_fixed_currency: string | null
          commission_method: Database["public"]["Enums"]["remittance_commission_method"]
          commission_percentage: number | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_payment_amount: number
          customer_payment_currency: string
          customer_phone: string | null
          customer_reference: string | null
          doc_no: string | null
          entry_date: string
          excess_allocation: Database["public"]["Enums"]["remittance_excess_allocation"]
          excess_allocation_note: string | null
          excess_allocation_target_id: string | null
          fx_purchase_rate: number | null
          fx_purchased_amount: number | null
          fx_supplier_customer_id: string | null
          fx_supplier_name: string | null
          fx_trading_profit_aed: number
          fx_trading_profit_pay_ccy: number
          gross_commission_aed: number
          gross_commission_pay_ccy: number
          id: string
          linked_buy_id: string | null
          linked_expenses_aed: number
          net_commission_aed: number
          notes: string | null
          payment_destination: Database["public"]["Enums"]["remittance_payment_destination"]
          payment_received_account_id: string | null
          payment_status: string | null
          reference_rate: number
          settlement_amount: number | null
          settlement_currency: string | null
          settlement_date: string | null
          settlement_proof_url: string | null
          source_account_id: string | null
          status: Database["public"]["Enums"]["remittance_status"]
          third_party_customer_id: string | null
          third_party_name: string | null
          total_profit_aed: number | null
          total_profit_pay_ccy: number | null
          transfer_currency: string
          transfer_date: string | null
          transfer_method: Database["public"]["Enums"]["remittance_transfer_method"]
          transferred_amount: number
          updated_at: string
          workflow_state:
            | Database["public"]["Enums"]["remittance_workflow_state"]
            | null
          workflow_version: Database["public"]["Enums"]["workflow_version"]
        }
        Insert: {
          beneficiary_account_number?: string | null
          beneficiary_bank?: string | null
          beneficiary_card_number?: string | null
          beneficiary_country?: string | null
          beneficiary_iban?: string | null
          beneficiary_name?: string | null
          beneficiary_notes?: string | null
          commission_fixed_amount?: number | null
          commission_fixed_currency?: string | null
          commission_method?: Database["public"]["Enums"]["remittance_commission_method"]
          commission_percentage?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_payment_amount?: number
          customer_payment_currency: string
          customer_phone?: string | null
          customer_reference?: string | null
          doc_no?: string | null
          entry_date?: string
          excess_allocation?: Database["public"]["Enums"]["remittance_excess_allocation"]
          excess_allocation_note?: string | null
          excess_allocation_target_id?: string | null
          fx_purchase_rate?: number | null
          fx_purchased_amount?: number | null
          fx_supplier_customer_id?: string | null
          fx_supplier_name?: string | null
          fx_trading_profit_aed?: number
          fx_trading_profit_pay_ccy?: number
          gross_commission_aed?: number
          gross_commission_pay_ccy?: number
          id?: string
          linked_buy_id?: string | null
          linked_expenses_aed?: number
          net_commission_aed?: number
          notes?: string | null
          payment_destination?: Database["public"]["Enums"]["remittance_payment_destination"]
          payment_received_account_id?: string | null
          payment_status?: string | null
          reference_rate?: number
          settlement_amount?: number | null
          settlement_currency?: string | null
          settlement_date?: string | null
          settlement_proof_url?: string | null
          source_account_id?: string | null
          status?: Database["public"]["Enums"]["remittance_status"]
          third_party_customer_id?: string | null
          third_party_name?: string | null
          total_profit_aed?: number | null
          total_profit_pay_ccy?: number | null
          transfer_currency: string
          transfer_date?: string | null
          transfer_method?: Database["public"]["Enums"]["remittance_transfer_method"]
          transferred_amount: number
          updated_at?: string
          workflow_state?:
            | Database["public"]["Enums"]["remittance_workflow_state"]
            | null
          workflow_version?: Database["public"]["Enums"]["workflow_version"]
        }
        Update: {
          beneficiary_account_number?: string | null
          beneficiary_bank?: string | null
          beneficiary_card_number?: string | null
          beneficiary_country?: string | null
          beneficiary_iban?: string | null
          beneficiary_name?: string | null
          beneficiary_notes?: string | null
          commission_fixed_amount?: number | null
          commission_fixed_currency?: string | null
          commission_method?: Database["public"]["Enums"]["remittance_commission_method"]
          commission_percentage?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_payment_amount?: number
          customer_payment_currency?: string
          customer_phone?: string | null
          customer_reference?: string | null
          doc_no?: string | null
          entry_date?: string
          excess_allocation?: Database["public"]["Enums"]["remittance_excess_allocation"]
          excess_allocation_note?: string | null
          excess_allocation_target_id?: string | null
          fx_purchase_rate?: number | null
          fx_purchased_amount?: number | null
          fx_supplier_customer_id?: string | null
          fx_supplier_name?: string | null
          fx_trading_profit_aed?: number
          fx_trading_profit_pay_ccy?: number
          gross_commission_aed?: number
          gross_commission_pay_ccy?: number
          id?: string
          linked_buy_id?: string | null
          linked_expenses_aed?: number
          net_commission_aed?: number
          notes?: string | null
          payment_destination?: Database["public"]["Enums"]["remittance_payment_destination"]
          payment_received_account_id?: string | null
          payment_status?: string | null
          reference_rate?: number
          settlement_amount?: number | null
          settlement_currency?: string | null
          settlement_date?: string | null
          settlement_proof_url?: string | null
          source_account_id?: string | null
          status?: Database["public"]["Enums"]["remittance_status"]
          third_party_customer_id?: string | null
          third_party_name?: string | null
          total_profit_aed?: number | null
          total_profit_pay_ccy?: number | null
          transfer_currency?: string
          transfer_date?: string | null
          transfer_method?: Database["public"]["Enums"]["remittance_transfer_method"]
          transferred_amount?: number
          updated_at?: string
          workflow_state?:
            | Database["public"]["Enums"]["remittance_workflow_state"]
            | null
          workflow_version?: Database["public"]["Enums"]["workflow_version"]
        }
        Relationships: [
          {
            foreignKeyName: "remittances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_fx_supplier_customer_id_fkey"
            columns: ["fx_supplier_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_linked_buy_id_fkey"
            columns: ["linked_buy_id"]
            isOneToOne: false
            referencedRelation: "buy_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_linked_buy_id_fkey"
            columns: ["linked_buy_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["linked_buy_id"]
          },
          {
            foreignKeyName: "remittances_payment_received_account_id_fkey"
            columns: ["payment_received_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "remittances_payment_received_account_id_fkey"
            columns: ["payment_received_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_payment_received_account_id_fkey"
            columns: ["payment_received_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "remittances_payment_received_account_id_fkey"
            columns: ["payment_received_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "remittances_payment_received_account_id_fkey"
            columns: ["payment_received_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "remittances_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "remittances_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "remittances_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "remittances_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "remittances_third_party_customer_id_fkey"
            columns: ["third_party_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      rpc_idempotency: {
        Row: {
          actor: string | null
          created_at: string
          request_id: string
          result: Json | null
          rpc_name: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          request_id: string
          result?: Json | null
          rpc_name: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          request_id?: string
          result?: Json | null
          rpc_name?: string
        }
        Relationships: []
      }
      sell_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          entry_date: string
          id: string
          notes: string | null
          receipt_url: string | null
          received_into_account_id: string | null
          sell_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          received_into_account_id?: string | null
          sell_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          receipt_url?: string | null
          received_into_account_id?: string | null
          sell_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sell_payments_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_payments_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_payments_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_payments_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_payments_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_payments_sell_id_fkey"
            columns: ["sell_id"]
            isOneToOne: false
            referencedRelation: "sale_allocations_view"
            referencedColumns: ["sell_id"]
          },
          {
            foreignKeyName: "sell_payments_sell_id_fkey"
            columns: ["sell_id"]
            isOneToOne: false
            referencedRelation: "sell_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_transactions: {
        Row: {
          ali_profit: number | null
          ali_share_pct: number
          allocated_cost_amount: number | null
          allocated_cost_currency: string | null
          allocation_mode: string | null
          amount_received: number
          attachment_url: string | null
          cancel_reason: string | null
          closed_at: string | null
          closed_by: string | null
          completion_note: string | null
          cost_basis_amount: number | null
          cost_basis_rate: number | null
          cost_basis_snapshot: Json | null
          created_at: string
          created_by: string | null
          creates_cycle: boolean
          currency_delivered: boolean
          currency_holder_type:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_account: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          deal_status: Database["public"]["Enums"]["sell_deal_status"]
          deleted_at: string | null
          delivered_at: string | null
          delivered_by: string | null
          delivered_to: string | null
          delivery_method: string | null
          delivery_notes: string | null
          doc_no: string | null
          due_date: string | null
          entry_date: string
          expected_payment_date: string | null
          gross_profit: number | null
          id: string
          linked_expenses_amount: number | null
          manual_allocation: Json | null
          margin_pct: number | null
          market_reference_rate: number | null
          market_reference_source: string | null
          market_reference_time: string | null
          milad_profit: number | null
          milad_share_pct: number
          money_holder_type: Database["public"]["Enums"]["holder_type"] | null
          money_location: Database["public"]["Enums"]["money_location"] | null
          net_profit_aed: number | null
          net_profit_irr: number | null
          notes: string | null
          payment_difference_reason: string | null
          profit_frozen_at: string | null
          profit_frozen_by: string | null
          rate_difference: number | null
          rate_difference_percent: number | null
          received_amount: number
          received_currency: string
          received_into_account_id: string | null
          reference_buy_rate: number | null
          reference_currency: string | null
          reference_mid_rate: number | null
          reference_rate_source: string | null
          reference_rate_time: string | null
          reference_sell_rate: number | null
          sale_value_amount: number | null
          sale_value_currency: string | null
          sell_rate: number
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          sold_amount: number
          sold_currency: string
          sold_from_account_id: string
          trade_cycle_id: string | null
          transaction_rate: number | null
          updated_at: string
        }
        Insert: {
          ali_profit?: number | null
          ali_share_pct?: number
          allocated_cost_amount?: number | null
          allocated_cost_currency?: string | null
          allocation_mode?: string | null
          amount_received?: number
          attachment_url?: string | null
          cancel_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completion_note?: string | null
          cost_basis_amount?: number | null
          cost_basis_rate?: number | null
          cost_basis_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          creates_cycle?: boolean
          currency_delivered?: boolean
          currency_holder_type?:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_account?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deal_status?: Database["public"]["Enums"]["sell_deal_status"]
          deleted_at?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivered_to?: string | null
          delivery_method?: string | null
          delivery_notes?: string | null
          doc_no?: string | null
          due_date?: string | null
          entry_date?: string
          expected_payment_date?: string | null
          gross_profit?: number | null
          id?: string
          linked_expenses_amount?: number | null
          manual_allocation?: Json | null
          margin_pct?: number | null
          market_reference_rate?: number | null
          market_reference_source?: string | null
          market_reference_time?: string | null
          milad_profit?: number | null
          milad_share_pct?: number
          money_holder_type?: Database["public"]["Enums"]["holder_type"] | null
          money_location?: Database["public"]["Enums"]["money_location"] | null
          net_profit_aed?: number | null
          net_profit_irr?: number | null
          notes?: string | null
          payment_difference_reason?: string | null
          profit_frozen_at?: string | null
          profit_frozen_by?: string | null
          rate_difference?: number | null
          rate_difference_percent?: number | null
          received_amount: number
          received_currency: string
          received_into_account_id?: string | null
          reference_buy_rate?: number | null
          reference_currency?: string | null
          reference_mid_rate?: number | null
          reference_rate_source?: string | null
          reference_rate_time?: string | null
          reference_sell_rate?: number | null
          sale_value_amount?: number | null
          sale_value_currency?: string | null
          sell_rate: number
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          sold_amount: number
          sold_currency: string
          sold_from_account_id: string
          trade_cycle_id?: string | null
          transaction_rate?: number | null
          updated_at?: string
        }
        Update: {
          ali_profit?: number | null
          ali_share_pct?: number
          allocated_cost_amount?: number | null
          allocated_cost_currency?: string | null
          allocation_mode?: string | null
          amount_received?: number
          attachment_url?: string | null
          cancel_reason?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completion_note?: string | null
          cost_basis_amount?: number | null
          cost_basis_rate?: number | null
          cost_basis_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          creates_cycle?: boolean
          currency_delivered?: boolean
          currency_holder_type?:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_account?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deal_status?: Database["public"]["Enums"]["sell_deal_status"]
          deleted_at?: string | null
          delivered_at?: string | null
          delivered_by?: string | null
          delivered_to?: string | null
          delivery_method?: string | null
          delivery_notes?: string | null
          doc_no?: string | null
          due_date?: string | null
          entry_date?: string
          expected_payment_date?: string | null
          gross_profit?: number | null
          id?: string
          linked_expenses_amount?: number | null
          manual_allocation?: Json | null
          margin_pct?: number | null
          market_reference_rate?: number | null
          market_reference_source?: string | null
          market_reference_time?: string | null
          milad_profit?: number | null
          milad_share_pct?: number
          money_holder_type?: Database["public"]["Enums"]["holder_type"] | null
          money_location?: Database["public"]["Enums"]["money_location"] | null
          net_profit_aed?: number | null
          net_profit_irr?: number | null
          notes?: string | null
          payment_difference_reason?: string | null
          profit_frozen_at?: string | null
          profit_frozen_by?: string | null
          rate_difference?: number | null
          rate_difference_percent?: number | null
          received_amount?: number
          received_currency?: string
          received_into_account_id?: string | null
          reference_buy_rate?: number | null
          reference_currency?: string | null
          reference_mid_rate?: number | null
          reference_rate_source?: string | null
          reference_rate_time?: string | null
          reference_sell_rate?: number | null
          sale_value_amount?: number | null
          sale_value_currency?: string | null
          sell_rate?: number
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          sold_amount?: number
          sold_currency?: string
          sold_from_account_id?: string
          trade_cycle_id?: string | null
          transaction_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sell_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_transactions_received_into_account_id_fkey"
            columns: ["received_into_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_transactions_sold_from_account_id_fkey"
            columns: ["sold_from_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_transactions_sold_from_account_id_fkey"
            columns: ["sold_from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_transactions_sold_from_account_id_fkey"
            columns: ["sold_from_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_transactions_sold_from_account_id_fkey"
            columns: ["sold_from_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_transactions_sold_from_account_id_fkey"
            columns: ["sold_from_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "sell_transactions_trade_cycle_id_fkey"
            columns: ["trade_cycle_id"]
            isOneToOne: false
            referencedRelation: "trade_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_transactions_trade_cycle_id_fkey"
            columns: ["trade_cycle_id"]
            isOneToOne: false
            referencedRelation: "v_open_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_charges: {
        Row: {
          amount: number
          created_at: string
          currency: string
          customer_id: string | null
          entry_date: string
          id: string
          kind: Database["public"]["Enums"]["fee_kind"]
          notes: string | null
          ref_id: string | null
          ref_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          customer_id?: string | null
          entry_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["fee_kind"]
          notes?: string | null
          ref_id?: string | null
          ref_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          entry_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["fee_kind"]
          notes?: string | null
          ref_id?: string | null
          ref_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_charges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      third_party_clearing_accounts: {
        Row: {
          account_id: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          currency: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "third_party_clearing_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "third_party_clearing_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "third_party_clearing_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "third_party_clearing_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "third_party_clearing_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      trade_cycles: {
        Row: {
          ali_profit: number | null
          ali_share_pct: number | null
          avg_buyback_rate: number | null
          base_currency: string
          cancel_reason: string | null
          capital_amount: number | null
          capital_currency: string | null
          closed_at: string | null
          closed_by: string | null
          code: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          cycle_kind: string
          deal_code: string | null
          deleted_at: string | null
          entry_date: string
          estimated_profit: number
          expected_profit: number | null
          expected_profit_currency: string | null
          expenses_in_final_ccy: number
          final_account_id: string | null
          final_currency: string | null
          final_profit_confirmed: boolean
          final_returned_amount: number
          id: string
          initial_account_id: string | null
          initial_amount: number | null
          initial_currency: string | null
          intermediate_account_id: string | null
          intermediate_currency: string | null
          intermediate_received: number
          intermediate_used: number
          milad_profit: number | null
          milad_share_pct: number | null
          net_profit: number | null
          notes: string | null
          pending_profit: number | null
          profit_destination_account_id: string | null
          profit_status: string | null
          quote_currency: string | null
          realized_profit: number
          realized_profit_currency: string | null
          received_profit: number | null
          reference_buy_rate: number | null
          reference_currency: string | null
          reference_mid_rate: number | null
          reference_rate_source: string | null
          reference_rate_time: string | null
          reference_sell_rate: number | null
          related_expenses: number | null
          sell_rate: number | null
          status: Database["public"]["Enums"]["trade_status"]
          title: string | null
          trade_mode: string | null
          updated_at: string
        }
        Insert: {
          ali_profit?: number | null
          ali_share_pct?: number | null
          avg_buyback_rate?: number | null
          base_currency?: string
          cancel_reason?: string | null
          capital_amount?: number | null
          capital_currency?: string | null
          closed_at?: string | null
          closed_by?: string | null
          code?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          cycle_kind?: string
          deal_code?: string | null
          deleted_at?: string | null
          entry_date?: string
          estimated_profit?: number
          expected_profit?: number | null
          expected_profit_currency?: string | null
          expenses_in_final_ccy?: number
          final_account_id?: string | null
          final_currency?: string | null
          final_profit_confirmed?: boolean
          final_returned_amount?: number
          id?: string
          initial_account_id?: string | null
          initial_amount?: number | null
          initial_currency?: string | null
          intermediate_account_id?: string | null
          intermediate_currency?: string | null
          intermediate_received?: number
          intermediate_used?: number
          milad_profit?: number | null
          milad_share_pct?: number | null
          net_profit?: number | null
          notes?: string | null
          pending_profit?: number | null
          profit_destination_account_id?: string | null
          profit_status?: string | null
          quote_currency?: string | null
          realized_profit?: number
          realized_profit_currency?: string | null
          received_profit?: number | null
          reference_buy_rate?: number | null
          reference_currency?: string | null
          reference_mid_rate?: number | null
          reference_rate_source?: string | null
          reference_rate_time?: string | null
          reference_sell_rate?: number | null
          related_expenses?: number | null
          sell_rate?: number | null
          status?: Database["public"]["Enums"]["trade_status"]
          title?: string | null
          trade_mode?: string | null
          updated_at?: string
        }
        Update: {
          ali_profit?: number | null
          ali_share_pct?: number | null
          avg_buyback_rate?: number | null
          base_currency?: string
          cancel_reason?: string | null
          capital_amount?: number | null
          capital_currency?: string | null
          closed_at?: string | null
          closed_by?: string | null
          code?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          cycle_kind?: string
          deal_code?: string | null
          deleted_at?: string | null
          entry_date?: string
          estimated_profit?: number
          expected_profit?: number | null
          expected_profit_currency?: string | null
          expenses_in_final_ccy?: number
          final_account_id?: string | null
          final_currency?: string | null
          final_profit_confirmed?: boolean
          final_returned_amount?: number
          id?: string
          initial_account_id?: string | null
          initial_amount?: number | null
          initial_currency?: string | null
          intermediate_account_id?: string | null
          intermediate_currency?: string | null
          intermediate_received?: number
          intermediate_used?: number
          milad_profit?: number | null
          milad_share_pct?: number | null
          net_profit?: number | null
          notes?: string | null
          pending_profit?: number | null
          profit_destination_account_id?: string | null
          profit_status?: string | null
          quote_currency?: string | null
          realized_profit?: number
          realized_profit_currency?: string | null
          received_profit?: number | null
          reference_buy_rate?: number | null
          reference_currency?: string | null
          reference_mid_rate?: number | null
          reference_rate_source?: string | null
          reference_rate_time?: string | null
          reference_sell_rate?: number | null
          related_expenses?: number | null
          sell_rate?: number | null
          status?: Database["public"]["Enums"]["trade_status"]
          title?: string | null
          trade_mode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_cycles_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_final_account_id_fkey"
            columns: ["final_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_final_account_id_fkey"
            columns: ["final_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_final_account_id_fkey"
            columns: ["final_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_final_account_id_fkey"
            columns: ["final_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_final_account_id_fkey"
            columns: ["final_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_profit_destination_account_id_fkey"
            columns: ["profit_destination_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_profit_destination_account_id_fkey"
            columns: ["profit_destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_profit_destination_account_id_fkey"
            columns: ["profit_destination_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_profit_destination_account_id_fkey"
            columns: ["profit_destination_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_profit_destination_account_id_fkey"
            columns: ["profit_destination_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      trade_movements: {
        Row: {
          amount: number
          completion_note: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          doc_required: boolean
          entry_date: string
          from_account_id: string | null
          from_customer_id: string | null
          from_kind: Database["public"]["Enums"]["party_kind"] | null
          from_label: string | null
          id: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          purpose: string | null
          rate: number | null
          related_customer_id: string | null
          seq: number
          status: Database["public"]["Enums"]["movement_status"]
          to_account_id: string | null
          to_customer_id: string | null
          to_kind: Database["public"]["Enums"]["party_kind"] | null
          to_label: string | null
          trade_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          completion_note?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          doc_required?: boolean
          entry_date?: string
          from_account_id?: string | null
          from_customer_id?: string | null
          from_kind?: Database["public"]["Enums"]["party_kind"] | null
          from_label?: string | null
          id?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          purpose?: string | null
          rate?: number | null
          related_customer_id?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["movement_status"]
          to_account_id?: string | null
          to_customer_id?: string | null
          to_kind?: Database["public"]["Enums"]["party_kind"] | null
          to_label?: string | null
          trade_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          completion_note?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          doc_required?: boolean
          entry_date?: string
          from_account_id?: string | null
          from_customer_id?: string | null
          from_kind?: Database["public"]["Enums"]["party_kind"] | null
          from_label?: string | null
          id?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          purpose?: string | null
          rate?: number | null
          related_customer_id?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["movement_status"]
          to_account_id?: string | null
          to_customer_id?: string | null
          to_kind?: Database["public"]["Enums"]["party_kind"] | null
          to_label?: string | null
          trade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_movements_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_movements_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_movements_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_movements_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_movements_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_movements_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_movements_from_customer_id_fkey"
            columns: ["from_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_movements_related_customer_id_fkey"
            columns: ["related_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_movements_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_movements_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_movements_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_movements_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_movements_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_movements_to_customer_id_fkey"
            columns: ["to_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_movements_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trade_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_movements_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "v_open_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_profit_collections: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          entry_date: string
          id: string
          notes: string | null
          received_by: string | null
          status: Database["public"]["Enums"]["profit_status"]
          trade_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          created_by?: string | null
          currency: string
          entry_date?: string
          id?: string
          notes?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["profit_status"]
          trade_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          entry_date?: string
          id?: string
          notes?: string | null
          received_by?: string | null
          status?: Database["public"]["Enums"]["profit_status"]
          trade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_profit_collections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_profit_collections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_profit_collections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_profit_collections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_profit_collections_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_profit_collections_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trade_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_profit_collections_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "v_open_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number
          attachment_url: string | null
          cancel_reason: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          entry_date: string
          from_account_id: string
          id: string
          money_location: Database["public"]["Enums"]["money_location"] | null
          notes: string | null
          reason: string | null
          requested_by: Database["public"]["Enums"]["brought_in_by"] | null
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          to_account_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          cancel_reason?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          entry_date?: string
          from_account_id: string
          id?: string
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          reason?: string | null
          requested_by?: Database["public"]["Enums"]["brought_in_by"] | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          to_account_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          cancel_reason?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          entry_date?: string
          from_account_id?: string
          id?: string
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          reason?: string | null
          requested_by?: Database["public"]["Enums"]["brought_in_by"] | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          to_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          account_type: Database["public"]["Enums"]["account_type"] | null
          currency: string | null
          current_balance: number | null
          name: string | null
          owner: Database["public"]["Enums"]["account_owner"] | null
        }
        Relationships: []
      }
      account_hierarchy_balances: {
        Row: {
          account_id: string | null
          balance: number | null
          currency: string | null
        }
        Relationships: []
      }
      company_vs_customer_funds: {
        Row: {
          balance: number | null
          bucket: string | null
          currency: string | null
        }
        Relationships: []
      }
      currency_inventory: {
        Row: {
          currency: string | null
          total_amount: number | null
        }
        Relationships: []
      }
      customer_wallet_balances: {
        Row: {
          account_id: string | null
          balance: number | null
          currency: string | null
          customer_id: string | null
          customer_name: string | null
          last_activity: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_holder_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_exposure: {
        Row: {
          available: number | null
          avg_cost: number | null
          cost_ccy: string | null
          currency: string | null
          market_buy: number | null
          market_fetched_at: string | null
          market_mid: number | null
          market_sell: number | null
          unrealized_pl: number | null
          unrealized_pl_pct: number | null
        }
        Relationships: []
      }
      inventory_lots_view: {
        Row: {
          account_id: string | null
          account_name: string | null
          cost_basis_currency: string | null
          cost_basis_rate: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          entry_date: string | null
          id: string | null
          lot_code: string | null
          notes: string | null
          original_amount: number | null
          remaining_amount: number | null
          sold_amount: number | null
          source_description: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          status: Database["public"]["Enums"]["inventory_lot_status"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      market_rate_deltas: {
        Row: {
          currency: string | null
          current_buy: number | null
          current_mid: number | null
          current_sell: number | null
          fetched_at: string | null
          mid_15m: number | null
          mid_1h: number | null
          mid_24h: number | null
          mid_5m: number | null
          pct_15m: number | null
          pct_1h: number | null
          pct_24h: number | null
          pct_5m: number | null
        }
        Relationships: []
      }
      market_rates_latest: {
        Row: {
          buy_rate: number | null
          currency: string | null
          error_message: string | null
          fetched_at: string | null
          id: string | null
          mid_rate: number | null
          sell_rate: number | null
          source: string | null
          status: string | null
        }
        Relationships: []
      }
      market_rates_recent: {
        Row: {
          buy_rate: number | null
          currency: string | null
          error_message: string | null
          fetched_at: string | null
          id: string | null
          mid_rate: number | null
          rn: number | null
          sell_rate: number | null
          source: string | null
          status: string | null
        }
        Relationships: []
      }
      profit_by_account: {
        Row: {
          account_currency: string | null
          account_id: string | null
          account_name: string | null
          ali_profit: number | null
          gross_profit: number | null
          milad_profit: number | null
          received_amount: number | null
          received_currency: string | null
          sell_count: number | null
          sold_amount: number | null
          sold_currency: string | null
          total_cost: number | null
        }
        Relationships: []
      }
      profit_by_lot: {
        Row: {
          cost_basis_currency: string | null
          cost_basis_rate: number | null
          currency: string | null
          gross_profit: number | null
          lot_code: string | null
          lot_id: string | null
          sold_amount: number | null
          source_description: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          total_cost: number | null
          total_received: number | null
        }
        Relationships: []
      }
      profit_by_source: {
        Row: {
          cost_basis_currency: string | null
          currency: string | null
          gross_profit: number | null
          sold_amount: number | null
          source_name: string | null
          source_person: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          total_cost: number | null
          total_received: number | null
        }
        Relationships: []
      }
      remaining_by_cost_rate: {
        Row: {
          account_id: string | null
          account_name: string | null
          cost_basis_currency: string | null
          cost_basis_rate: number | null
          currency: string | null
          lot_count: number | null
          remaining_amount: number | null
          remaining_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      sale_allocations_view: {
        Row: {
          account_id: string | null
          account_name: string | null
          amount_consumed: number | null
          cost_amount: number | null
          cost_basis_currency: string | null
          cost_rate: number | null
          currency: string | null
          entry_date: string | null
          gross_profit: number | null
          id: string | null
          lot_code: string | null
          received_amount: number | null
          received_currency: string | null
          sell_id: string | null
          sell_rate: number | null
          source_description: string | null
          source_ref_id: string | null
          source_ref_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      service_charge_daily: {
        Row: {
          currency: string | null
          entry_date: string | null
          total: number | null
        }
        Relationships: []
      }
      v_ali_capital_summary: {
        Row: {
          currently_holding: number | null
          total_brought_in: number | null
          total_paid_expenses: number | null
          total_profit_share: number | null
        }
        Relationships: []
      }
      v_balance_reconciliation: {
        Row: {
          account_id: string | null
          account_name: string | null
          account_type: string | null
          currency: string | null
          diff: number | null
          inventory_balance: number | null
          is_mismatch: boolean | null
          ledger_balance: number | null
        }
        Relationships: []
      }
      v_balances_by_currency_type: {
        Row: {
          account_count: number | null
          account_type: string | null
          currency: string | null
          total_balance: number | null
        }
        Relationships: []
      }
      v_cash_available: {
        Row: {
          balance: number | null
          currency: string | null
        }
        Relationships: []
      }
      v_currency_inventory_summary: {
        Row: {
          available_amount: number | null
          capital_amount: number | null
          cost_basis_currency: string | null
          currency: string | null
          estimated_value_irr: number | null
          known_cost_amount: number | null
          lot_count: number | null
          market_buy: number | null
          market_mid: number | null
          market_sell: number | null
          unknown_cost_amount: number | null
          unrealized_profit_aed: number | null
          unrealized_profit_irr: number | null
          weighted_avg_cost_rate: number | null
        }
        Relationships: []
      }
      v_daily_profit_series: {
        Row: {
          ali_profit: number | null
          day: string | null
          gross_profit: number | null
          milad_profit: number | null
        }
        Relationships: []
      }
      v_lot_detailed: {
        Row: {
          account_id: string | null
          account_name: string | null
          account_path: string | null
          age_days: number | null
          cost_basis_currency: string | null
          cost_basis_rate: number | null
          cost_basis_status: string | null
          currency: string | null
          entry_date: string | null
          id: string | null
          lot_code: string | null
          market_buy_rate: number | null
          market_sell_rate: number | null
          original_amount: number | null
          remaining_amount: number | null
          sold_amount: number | null
          source_description: string | null
          source_ref_id: string | null
          source_ref_type: string | null
          status: string | null
          unrealized_pl: number | null
          unrealized_pl_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "inventory_lots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      v_money_in_circulation: {
        Row: {
          balance: number | null
          currency: string | null
        }
        Relationships: []
      }
      v_month_profit: {
        Row: {
          ali_profit: number | null
          gross_profit: number | null
          milad_profit: number | null
          sell_count: number | null
        }
        Relationships: []
      }
      v_open_cycles: {
        Row: {
          ali_profit: number | null
          avg_buyback_rate: number | null
          code: string | null
          customer_id: string | null
          entry_date: string | null
          estimated_profit: number | null
          expenses_in_final_ccy: number | null
          final_currency: string | null
          final_returned_amount: number | null
          id: string | null
          initial_account_id: string | null
          initial_amount: number | null
          initial_currency: string | null
          intermediate_account_id: string | null
          intermediate_currency: string | null
          intermediate_received: number | null
          intermediate_remaining: number | null
          intermediate_used: number | null
          milad_profit: number | null
          net_profit: number | null
          realized_profit: number | null
          realized_profit_currency: string | null
          sell_rate: number | null
          status: Database["public"]["Enums"]["trade_status"] | null
          title: string | null
        }
        Insert: {
          ali_profit?: number | null
          avg_buyback_rate?: number | null
          code?: string | null
          customer_id?: string | null
          entry_date?: string | null
          estimated_profit?: number | null
          expenses_in_final_ccy?: number | null
          final_currency?: string | null
          final_returned_amount?: number | null
          id?: string | null
          initial_account_id?: string | null
          initial_amount?: number | null
          initial_currency?: string | null
          intermediate_account_id?: string | null
          intermediate_currency?: string | null
          intermediate_received?: number | null
          intermediate_remaining?: never
          intermediate_used?: number | null
          milad_profit?: number | null
          net_profit?: number | null
          realized_profit?: number | null
          realized_profit_currency?: string | null
          sell_rate?: number | null
          status?: Database["public"]["Enums"]["trade_status"] | null
          title?: string | null
        }
        Update: {
          ali_profit?: number | null
          avg_buyback_rate?: number | null
          code?: string | null
          customer_id?: string | null
          entry_date?: string | null
          estimated_profit?: number | null
          expenses_in_final_ccy?: number | null
          final_currency?: string | null
          final_returned_amount?: number | null
          id?: string | null
          initial_account_id?: string | null
          initial_amount?: number | null
          initial_currency?: string | null
          intermediate_account_id?: string | null
          intermediate_currency?: string | null
          intermediate_received?: number | null
          intermediate_remaining?: never
          intermediate_used?: number | null
          milad_profit?: number | null
          net_profit?: number | null
          realized_profit?: number | null
          realized_profit_currency?: string | null
          sell_rate?: number | null
          status?: Database["public"]["Enums"]["trade_status"] | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trade_cycles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_initial_account_id_fkey"
            columns: ["initial_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "customer_wallet_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "profit_by_account"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "trade_cycles_intermediate_account_id_fkey"
            columns: ["intermediate_account_id"]
            isOneToOne: false
            referencedRelation: "v_balance_reconciliation"
            referencedColumns: ["account_id"]
          },
        ]
      }
      v_remittance_migration_diff: {
        Row: {
          actual_buy_amount: number | null
          actual_buy_currency: string | null
          already_allocated: number | null
          buy_capacity_remaining: number | null
          buy_delivered: boolean | null
          doc_no: string | null
          existing_alloc_count: number | null
          expected_settlement_amount: number | null
          expected_settlement_currency: string | null
          linked_buy_id: string | null
          lot_count: number | null
          payment_destination:
            | Database["public"]["Enums"]["remittance_payment_destination"]
            | null
          remittance_id: string | null
          workflow_version:
            | Database["public"]["Enums"]["workflow_version"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "remittances_linked_buy_id_fkey"
            columns: ["linked_buy_id"]
            isOneToOne: false
            referencedRelation: "buy_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_linked_buy_id_fkey"
            columns: ["linked_buy_id"]
            isOneToOne: false
            referencedRelation: "v_remittance_settlement_path"
            referencedColumns: ["linked_buy_id"]
          },
        ]
      }
      v_remittance_settlement_path: {
        Row: {
          entry_date: string | null
          excess_allocation:
            | Database["public"]["Enums"]["remittance_excess_allocation"]
            | null
          linked_buy_code: string | null
          linked_buy_id: string | null
          net_commission_aed: number | null
          payer_customer_id: string | null
          payer_name: string | null
          payment_destination:
            | Database["public"]["Enums"]["remittance_payment_destination"]
            | null
          remittance_code: string | null
          remittance_id: string | null
          remittance_sent_amount: number | null
          remittance_sent_currency: string | null
          settlement_amount: number | null
          settlement_currency: string | null
          settlement_date: string | null
          settlement_proof_url: string | null
          status: Database["public"]["Enums"]["remittance_status"] | null
          supplier_bought_amount: number | null
          supplier_bought_currency: string | null
          supplier_delivered: boolean | null
          supplier_delivered_at: string | null
          supplier_rate: number | null
          supplier_settled_amount: number | null
          third_party_customer_id: string | null
          third_party_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remittances_customer_id_fkey"
            columns: ["payer_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remittances_third_party_customer_id_fkey"
            columns: ["third_party_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_today_profit: {
        Row: {
          ali_profit: number | null
          gross_profit: number | null
          milad_profit: number | null
          sell_count: number | null
        }
        Relationships: []
      }
      v_total_assets_by_currency: {
        Row: {
          balance: number | null
          currency: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _assert_flag: { Args: { _key: string }; Returns: undefined }
      _assert_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: undefined
      }
      _calc_required_delivery_amount: {
        Args: { _remittance_id: string }
        Returns: number
      }
      _idem_lookup: { Args: { _req: string }; Returns: Json }
      _idem_store: {
        Args: { _req: string; _result: Json; _rpc: string }
        Returns: undefined
      }
      _insert_workflow_transition_if_changed: {
        Args: {
          _from: Database["public"]["Enums"]["remittance_workflow_state"]
          _reason: string
          _remittance_id: string
          _to: Database["public"]["Enums"]["remittance_workflow_state"]
        }
        Returns: undefined
      }
      _remittance_delivered_so_far: {
        Args: { _remittance_id: string }
        Returns: number
      }
      _remittance_third_party_settled_so_far: {
        Args: { _remittance_id: string }
        Returns: number
      }
      admin_force_close: {
        Args: { _reason: string; _sell_id: string }
        Returns: undefined
      }
      admin_recalculate_balances: { Args: never; Returns: Json }
      admin_reconcile: { Args: { _reason: string }; Returns: Json }
      assert_posting_active: {
        Args: { _class: Database["public"]["Enums"]["posting_class"] }
        Returns: undefined
      }
      assign_lot_cost_basis: {
        Args: {
          _cost_currency: string
          _cost_rate: number
          _lot_id: string
          _reason: string
        }
        Returns: undefined
      }
      avg_buy_rate: {
        Args: { _as_of?: string; _currency: string; _quote_currency: string }
        Returns: number
      }
      can_write: { Args: { _user_id: string }; Returns: boolean }
      cancel_record: {
        Args: { _device?: string; _id: string; _reason: string; _table: string }
        Returns: undefined
      }
      cancel_sell_deal: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      close_sell_deal: {
        Args: { _difference_reason?: string; _id: string; _override?: boolean }
        Returns: undefined
      }
      consume_lots_fifo: {
        Args: {
          _account_id: string
          _amount: number
          _currency: string
          _entry_date: string
          _sell_id: string
        }
        Returns: {
          blended_rate: number
          cost_ccy: string
          total_cost: number
        }[]
      }
      freeze_sell_profit: {
        Args: { _recompute?: boolean; _sell_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_lot_capital: {
        Args: { _lot_id: string; _reason: string }
        Returns: undefined
      }
      mark_sell_delivered: {
        Args: {
          _delivered_to?: string
          _id: string
          _method: string
          _notes?: string
          _sold_from_account_id?: string
        }
        Returns: undefined
      }
      next_doc_no: { Args: { _prefix: string; _year: number }; Returns: string }
      preview_sell_allocation: {
        Args: {
          _amount: number
          _currency: string
          _manual?: Json
          _mode?: string
          _source_account_id?: string
        }
        Returns: Json
      }
      receive_linked_buy: {
        Args: {
          _bought_amount?: number
          _bought_currency?: string
          _buy_id: string
          _delivered_at?: string
          _note?: string
          _received_into_account_id: string
        }
        Returns: undefined
      }
      recompute_cycle_profit: {
        Args: { _cycle_id: string }
        Returns: undefined
      }
      recompute_sell_deal_status: {
        Args: { _sell_id: string }
        Returns: undefined
      }
      recompute_trade_totals: {
        Args: { _trade_id: string }
        Returns: undefined
      }
      record_supplier_delivery: {
        Args: { _buy_id: string; _note?: string }
        Returns: undefined
      }
      remittance_v2_allocate_buy: {
        Args: {
          _amount: number
          _buy_id: string
          _client_request_id?: string
          _notes?: string
          _remittance_id: string
        }
        Returns: string
      }
      remittance_v2_cancel: {
        Args: { _client_request_id?: string; _id: string; _reason: string }
        Returns: undefined
      }
      remittance_v2_create: {
        Args: { _client_request_id?: string; _payload: Json }
        Returns: string
      }
      remittance_v2_finalize_close: {
        Args: { _client_request_id?: string; _id: string; _note?: string }
        Returns: undefined
      }
      remittance_v2_mark_funds_received: {
        Args: {
          _account_id: string
          _amount: number
          _client_request_id?: string
          _id: string
          _note?: string
        }
        Returns: undefined
      }
      remittance_v2_prepare_close: {
        Args: { _client_request_id?: string; _id: string; _note?: string }
        Returns: undefined
      }
      remittance_v2_reconcile: {
        Args: never
        Returns: {
          check_id: number
          check_name: string
          delta: number
          details: Json
          passed: boolean
          severity: string
        }[]
      }
      remittance_v2_record_supplier_delivery: {
        Args: {
          _buy_id: string
          _client_request_id?: string
          _delivered_amount: number
          _delivered_at?: string
          _note?: string
          _received_into_account_id: string
          _remittance_id: string
        }
        Returns: string
      }
      remittance_v2_record_third_party_settlement: {
        Args: {
          _amount: number
          _client_request_id?: string
          _id: string
          _note?: string
          _third_party_customer_id: string
        }
        Returns: undefined
      }
      remittance_v2_reverse_allocation: {
        Args: {
          _allocation_id: string
          _client_request_id?: string
          _reason: string
        }
        Returns: string
      }
      remittance_v2_validate_close: { Args: { _id: string }; Returns: Json }
      rpc_idempotency_gc: { Args: { _days?: number }; Returns: number }
      run_remittance_shadow_backfill: {
        Args: { _note?: string }
        Returns: Json
      }
      set_edit_context: {
        Args: { _device?: string; _reason: string }
        Returns: undefined
      }
      sync_sell_received_lot: { Args: { _sell_id: string }; Returns: undefined }
      validate_close: { Args: { _sell_id: string }; Returns: Json }
      validate_third_party_settlement: {
        Args: { _remittance_id: string }
        Returns: Json
      }
    }
    Enums: {
      account_node_type: "box" | "location" | "currency_account"
      account_owner: "milad" | "ali" | "shared" | "other"
      account_type:
        | "cash"
        | "toman_bank"
        | "aed_bank"
        | "foreign_currency"
        | "wallet"
        | "person_holding"
        | "customer_wallet"
        | "pending_delivery"
        | "other"
      allocation_status: "draft" | "open" | "closed" | "reversed" | "void"
      app_role:
        | "admin"
        | "milad"
        | "ali"
        | "viewer"
        | "operator"
        | "manager"
        | "accountant"
      brought_in_by: "milad" | "ali" | "customer" | "other"
      brought_in_reason:
        | "capital"
        | "for_exchange"
        | "customer_payment"
        | "temporary_deposit"
        | "other"
      buy_settlement_source: "own_funds" | "remittance_payment" | "mixed"
      doc_type:
        | "payment_receipt"
        | "bank_transfer_screenshot"
        | "cash_delivery_receipt"
        | "currency_handover_proof"
        | "whatsapp_confirmation"
        | "invoice"
        | "expense_receipt"
        | "id_passport"
        | "other"
        | "deposit_receipt"
        | "payment_order_proof"
      entry_kind: "normal" | "reversal" | "adjustment"
      expense_kind:
        | "petrol"
        | "parking"
        | "delivery"
        | "transfer_fee"
        | "bank_charge"
        | "personal_ali"
        | "business"
        | "other"
      fee_kind: "fixed" | "percent" | "manual"
      holder_type: "milad" | "ali" | "customer" | "other"
      inventory_lot_status: "available" | "partial" | "depleted"
      ledger_ref_type:
        | "brought_in"
        | "buy"
        | "sell"
        | "expense"
        | "transfer"
        | "opening_balance"
        | "adjustment"
        | "deposit"
        | "payment_order"
        | "service_charge"
        | "sell_payment"
        | "remittance"
        | "third_party_settlement"
      migration_diff_category:
        | "matched"
        | "amount_mismatch"
        | "missing_buy"
        | "missing_lot"
        | "over_allocated"
        | "no_op"
        | "error"
        | "skipped_v2"
      money_location:
        | "cash_box"
        | "aed_bank"
        | "toman_bank"
        | "foreign_bank"
        | "held_milad"
        | "held_ali"
        | "held_customer"
        | "pending_delivery"
        | "pending_deposit"
      movement_status:
        | "pending"
        | "in_transit"
        | "completed"
        | "failed"
        | "waived"
      movement_type:
        | "send_money"
        | "receive_money"
        | "pay_third_party"
        | "receive_third_party"
        | "profit_collection"
        | "expense"
        | "service_charge"
        | "internal_transfer"
        | "settlement"
      paid_by: "milad" | "ali"
      party_kind:
        | "our_account"
        | "customer_account"
        | "customer"
        | "ali"
        | "milad"
        | "external_person"
        | "cash"
        | "other"
      payment_method:
        | "bank_transfer"
        | "cash_delivery"
        | "currency_delivery"
        | "internal"
        | "international"
        | "other"
      posting_class: "shadow" | "historical_active" | "operational_active"
      profit_status: "pending" | "received" | "waived" | "kept_in_wallet"
      remittance_commission_method: "fixed" | "percentage" | "included" | "free"
      remittance_excess_allocation:
        | "none"
        | "our_account"
        | "another_supplier"
        | "customer_balance"
        | "pending"
        | "commission"
      remittance_payment_destination:
        | "into_account"
        | "cash_to_us"
        | "to_third_party"
        | "settles_linked_buy"
        | "pending"
      remittance_status:
        | "open"
        | "waiting_customer_payment"
        | "payment_received"
        | "waiting_transfer"
        | "transfer_completed"
        | "waiting_transfer_proof"
        | "ready_to_close"
        | "closed"
        | "cancelled"
        | "customer_paid_supplier"
        | "waiting_settlement_proof"
        | "waiting_supplier_delivery"
        | "partially_settled"
      remittance_transfer_method:
        | "bank_transfer"
        | "cash_delivery"
        | "wallet_transfer"
        | "other"
      remittance_workflow_state:
        | "draft"
        | "funds_received"
        | "settlement_pending"
        | "allocating"
        | "ready_to_close"
        | "closed"
        | "cancelled"
      sell_deal_status:
        | "open"
        | "waiting_payment"
        | "partially_paid"
        | "waiting_receipt"
        | "ready_to_close"
        | "closed"
        | "cancelled"
        | "waiting_currency_delivery"
        | "waiting_delivery_proof"
      settlement_status:
        | "draft"
        | "awaiting_payment"
        | "payment_received"
        | "awaiting_delivery"
        | "currency_delivered"
        | "awaiting_receipt"
        | "completed"
        | "cancelled"
        | "pending_delivery"
      trade_status:
        | "draft"
        | "in_progress"
        | "awaiting_profit"
        | "awaiting_docs"
        | "completed"
        | "cancelled"
        | "open"
        | "partially_closed"
        | "profit_pending"
        | "loss"
        | "missing_receipt"
      txn_owner: "milad" | "ali" | "shared"
      workflow_version: "legacy" | "v2"
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
  public: {
    Enums: {
      account_node_type: ["box", "location", "currency_account"],
      account_owner: ["milad", "ali", "shared", "other"],
      account_type: [
        "cash",
        "toman_bank",
        "aed_bank",
        "foreign_currency",
        "wallet",
        "person_holding",
        "customer_wallet",
        "pending_delivery",
        "other",
      ],
      allocation_status: ["draft", "open", "closed", "reversed", "void"],
      app_role: [
        "admin",
        "milad",
        "ali",
        "viewer",
        "operator",
        "manager",
        "accountant",
      ],
      brought_in_by: ["milad", "ali", "customer", "other"],
      brought_in_reason: [
        "capital",
        "for_exchange",
        "customer_payment",
        "temporary_deposit",
        "other",
      ],
      buy_settlement_source: ["own_funds", "remittance_payment", "mixed"],
      doc_type: [
        "payment_receipt",
        "bank_transfer_screenshot",
        "cash_delivery_receipt",
        "currency_handover_proof",
        "whatsapp_confirmation",
        "invoice",
        "expense_receipt",
        "id_passport",
        "other",
        "deposit_receipt",
        "payment_order_proof",
      ],
      entry_kind: ["normal", "reversal", "adjustment"],
      expense_kind: [
        "petrol",
        "parking",
        "delivery",
        "transfer_fee",
        "bank_charge",
        "personal_ali",
        "business",
        "other",
      ],
      fee_kind: ["fixed", "percent", "manual"],
      holder_type: ["milad", "ali", "customer", "other"],
      inventory_lot_status: ["available", "partial", "depleted"],
      ledger_ref_type: [
        "brought_in",
        "buy",
        "sell",
        "expense",
        "transfer",
        "opening_balance",
        "adjustment",
        "deposit",
        "payment_order",
        "service_charge",
        "sell_payment",
        "remittance",
        "third_party_settlement",
      ],
      migration_diff_category: [
        "matched",
        "amount_mismatch",
        "missing_buy",
        "missing_lot",
        "over_allocated",
        "no_op",
        "error",
        "skipped_v2",
      ],
      money_location: [
        "cash_box",
        "aed_bank",
        "toman_bank",
        "foreign_bank",
        "held_milad",
        "held_ali",
        "held_customer",
        "pending_delivery",
        "pending_deposit",
      ],
      movement_status: [
        "pending",
        "in_transit",
        "completed",
        "failed",
        "waived",
      ],
      movement_type: [
        "send_money",
        "receive_money",
        "pay_third_party",
        "receive_third_party",
        "profit_collection",
        "expense",
        "service_charge",
        "internal_transfer",
        "settlement",
      ],
      paid_by: ["milad", "ali"],
      party_kind: [
        "our_account",
        "customer_account",
        "customer",
        "ali",
        "milad",
        "external_person",
        "cash",
        "other",
      ],
      payment_method: [
        "bank_transfer",
        "cash_delivery",
        "currency_delivery",
        "internal",
        "international",
        "other",
      ],
      posting_class: ["shadow", "historical_active", "operational_active"],
      profit_status: ["pending", "received", "waived", "kept_in_wallet"],
      remittance_commission_method: ["fixed", "percentage", "included", "free"],
      remittance_excess_allocation: [
        "none",
        "our_account",
        "another_supplier",
        "customer_balance",
        "pending",
        "commission",
      ],
      remittance_payment_destination: [
        "into_account",
        "cash_to_us",
        "to_third_party",
        "settles_linked_buy",
        "pending",
      ],
      remittance_status: [
        "open",
        "waiting_customer_payment",
        "payment_received",
        "waiting_transfer",
        "transfer_completed",
        "waiting_transfer_proof",
        "ready_to_close",
        "closed",
        "cancelled",
        "customer_paid_supplier",
        "waiting_settlement_proof",
        "waiting_supplier_delivery",
        "partially_settled",
      ],
      remittance_transfer_method: [
        "bank_transfer",
        "cash_delivery",
        "wallet_transfer",
        "other",
      ],
      remittance_workflow_state: [
        "draft",
        "funds_received",
        "settlement_pending",
        "allocating",
        "ready_to_close",
        "closed",
        "cancelled",
      ],
      sell_deal_status: [
        "open",
        "waiting_payment",
        "partially_paid",
        "waiting_receipt",
        "ready_to_close",
        "closed",
        "cancelled",
        "waiting_currency_delivery",
        "waiting_delivery_proof",
      ],
      settlement_status: [
        "draft",
        "awaiting_payment",
        "payment_received",
        "awaiting_delivery",
        "currency_delivered",
        "awaiting_receipt",
        "completed",
        "cancelled",
        "pending_delivery",
      ],
      trade_status: [
        "draft",
        "in_progress",
        "awaiting_profit",
        "awaiting_docs",
        "completed",
        "cancelled",
        "open",
        "partially_closed",
        "profit_pending",
        "loss",
        "missing_receipt",
      ],
      txn_owner: ["milad", "ali", "shared"],
      workflow_version: ["legacy", "v2"],
    },
  },
} as const
