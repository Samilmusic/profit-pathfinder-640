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
          card_number: string | null
          created_at: string
          created_by: string | null
          currency: string
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
          notes: string | null
          opening_balance: number
          owner: Database["public"]["Enums"]["account_owner"]
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          bank_name?: string | null
          card_number?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
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
          notes?: string | null
          opening_balance?: number
          owner?: Database["public"]["Enums"]["account_owner"]
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["account_type"]
          bank_name?: string | null
          card_number?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
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
          notes?: string | null
          opening_balance?: number
          owner?: Database["public"]["Enums"]["account_owner"]
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
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
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
          entry_date: string
          final_deposit_account_id: string | null
          id: string
          notes: string | null
          reason: Database["public"]["Enums"]["brought_in_reason"]
          sender_account_name: string | null
          sender_account_number: string | null
          sender_bank_name: string | null
          source_location_label: string | null
          source_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          brought_by: Database["public"]["Enums"]["brought_in_by"]
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
          entry_date?: string
          final_deposit_account_id?: string | null
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["brought_in_reason"]
          sender_account_name?: string | null
          sender_account_number?: string | null
          sender_bank_name?: string | null
          source_location_label?: string | null
          source_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          brought_by?: Database["public"]["Enums"]["brought_in_by"]
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
          entry_date?: string
          final_deposit_account_id?: string | null
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["brought_in_reason"]
          sender_account_name?: string | null
          sender_account_number?: string | null
          sender_bank_name?: string | null
          source_location_label?: string | null
          source_name?: string | null
          status?: string
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
        ]
      }
      buy_transactions: {
        Row: {
          attachment_url: string | null
          bought_amount: number
          bought_currency: string
          buy_rate: number
          completion_note: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          currency_holder_type:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_id: string | null
          deleted_at: string | null
          due_date: string | null
          entry_date: string
          id: string
          money_holder_type: Database["public"]["Enums"]["holder_type"] | null
          money_location: Database["public"]["Enums"]["money_location"] | null
          notes: string | null
          paid_amount: number
          paid_currency: string
          paid_from_account_id: string
          received_into_account_id: string
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          txn_owner: Database["public"]["Enums"]["txn_owner"]
          updated_at: string
        }
        Insert: {
          attachment_url?: string | null
          bought_amount: number
          bought_currency: string
          buy_rate: number
          completion_note?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency_holder_type?:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_id?: string | null
          deleted_at?: string | null
          due_date?: string | null
          entry_date?: string
          id?: string
          money_holder_type?: Database["public"]["Enums"]["holder_type"] | null
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_amount: number
          paid_currency: string
          paid_from_account_id: string
          received_into_account_id: string
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          txn_owner?: Database["public"]["Enums"]["txn_owner"]
          updated_at?: string
        }
        Update: {
          attachment_url?: string | null
          bought_amount?: number
          bought_currency?: string
          buy_rate?: number
          completion_note?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency_holder_type?:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_id?: string | null
          deleted_at?: string | null
          due_date?: string | null
          entry_date?: string
          id?: string
          money_holder_type?: Database["public"]["Enums"]["holder_type"] | null
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_amount?: number
          paid_currency?: string
          paid_from_account_id?: string
          received_into_account_id?: string
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
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
        ]
      }
      customers: {
        Row: {
          account_details: string | null
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
          category: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          entry_date: string
          expense_kind: Database["public"]["Enums"]["expense_kind"] | null
          id: string
          is_business: boolean
          money_location: Database["public"]["Enums"]["money_location"] | null
          notes: string | null
          paid_by: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id: string
          receipt_required: boolean
          reduces_profit: boolean
          related_buy_id: string | null
          related_person: string | null
          related_ref_id: string | null
          related_ref_type: string | null
          related_sell_id: string | null
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          category?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          entry_date?: string
          expense_kind?: Database["public"]["Enums"]["expense_kind"] | null
          id?: string
          is_business?: boolean
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_by: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id: string
          receipt_required?: boolean
          reduces_profit?: boolean
          related_buy_id?: string | null
          related_person?: string | null
          related_ref_id?: string | null
          related_ref_type?: string | null
          related_sell_id?: string | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          entry_date?: string
          expense_kind?: Database["public"]["Enums"]["expense_kind"] | null
          id?: string
          is_business?: boolean
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          paid_by?: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id?: string
          receipt_required?: boolean
          reduces_profit?: boolean
          related_buy_id?: string | null
          related_person?: string | null
          related_ref_id?: string | null
          related_ref_type?: string | null
          related_sell_id?: string | null
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
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
            foreignKeyName: "expenses_related_buy_id_fkey"
            columns: ["related_buy_id"]
            isOneToOne: false
            referencedRelation: "buy_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_related_sell_id_fkey"
            columns: ["related_sell_id"]
            isOneToOne: false
            referencedRelation: "sell_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_lots: {
        Row: {
          account_id: string | null
          cost_basis_currency: string
          cost_basis_rate: number
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
        ]
      }
      payment_orders: {
        Row: {
          amount: number
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
      sell_transactions: {
        Row: {
          ali_profit: number | null
          ali_share_pct: number
          attachment_url: string | null
          completion_note: string | null
          cost_basis_amount: number | null
          cost_basis_rate: number | null
          created_at: string
          created_by: string | null
          currency_holder_type:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_account: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          deleted_at: string | null
          due_date: string | null
          entry_date: string
          gross_profit: number | null
          id: string
          milad_profit: number | null
          milad_share_pct: number
          money_holder_type: Database["public"]["Enums"]["holder_type"] | null
          money_location: Database["public"]["Enums"]["money_location"] | null
          notes: string | null
          received_amount: number
          received_currency: string
          received_into_account_id: string
          sell_rate: number
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          sold_amount: number
          sold_currency: string
          sold_from_account_id: string
          updated_at: string
        }
        Insert: {
          ali_profit?: number | null
          ali_share_pct?: number
          attachment_url?: string | null
          completion_note?: string | null
          cost_basis_amount?: number | null
          cost_basis_rate?: number | null
          created_at?: string
          created_by?: string | null
          currency_holder_type?:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_account?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deleted_at?: string | null
          due_date?: string | null
          entry_date?: string
          gross_profit?: number | null
          id?: string
          milad_profit?: number | null
          milad_share_pct?: number
          money_holder_type?: Database["public"]["Enums"]["holder_type"] | null
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          received_amount: number
          received_currency: string
          received_into_account_id: string
          sell_rate: number
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          sold_amount: number
          sold_currency: string
          sold_from_account_id: string
          updated_at?: string
        }
        Update: {
          ali_profit?: number | null
          ali_share_pct?: number
          attachment_url?: string | null
          completion_note?: string | null
          cost_basis_amount?: number | null
          cost_basis_rate?: number | null
          created_at?: string
          created_by?: string | null
          currency_holder_type?:
            | Database["public"]["Enums"]["holder_type"]
            | null
          customer_account?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deleted_at?: string | null
          due_date?: string | null
          entry_date?: string
          gross_profit?: number | null
          id?: string
          milad_profit?: number | null
          milad_share_pct?: number
          money_holder_type?: Database["public"]["Enums"]["holder_type"] | null
          money_location?: Database["public"]["Enums"]["money_location"] | null
          notes?: string | null
          received_amount?: number
          received_currency?: string
          received_into_account_id?: string
          sell_rate?: number
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          sold_amount?: number
          sold_currency?: string
          sold_from_account_id?: string
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
      trade_cycles: {
        Row: {
          ali_profit: number | null
          ali_share_pct: number | null
          base_currency: string
          capital_amount: number | null
          capital_currency: string | null
          closed_at: string | null
          closed_by: string | null
          code: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          deleted_at: string | null
          entry_date: string
          expected_profit: number | null
          expected_profit_currency: string | null
          final_profit_confirmed: boolean
          id: string
          milad_profit: number | null
          milad_share_pct: number | null
          net_profit: number | null
          notes: string | null
          pending_profit: number | null
          quote_currency: string | null
          received_profit: number | null
          related_expenses: number | null
          status: Database["public"]["Enums"]["trade_status"]
          title: string | null
          updated_at: string
        }
        Insert: {
          ali_profit?: number | null
          ali_share_pct?: number | null
          base_currency?: string
          capital_amount?: number | null
          capital_currency?: string | null
          closed_at?: string | null
          closed_by?: string | null
          code?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          entry_date?: string
          expected_profit?: number | null
          expected_profit_currency?: string | null
          final_profit_confirmed?: boolean
          id?: string
          milad_profit?: number | null
          milad_share_pct?: number | null
          net_profit?: number | null
          notes?: string | null
          pending_profit?: number | null
          quote_currency?: string | null
          received_profit?: number | null
          related_expenses?: number | null
          status?: Database["public"]["Enums"]["trade_status"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          ali_profit?: number | null
          ali_share_pct?: number | null
          base_currency?: string
          capital_amount?: number | null
          capital_currency?: string | null
          closed_at?: string | null
          closed_by?: string | null
          code?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          entry_date?: string
          expected_profit?: number | null
          expected_profit_currency?: string | null
          final_profit_confirmed?: boolean
          id?: string
          milad_profit?: number | null
          milad_share_pct?: number | null
          net_profit?: number | null
          notes?: string | null
          pending_profit?: number | null
          quote_currency?: string | null
          received_profit?: number | null
          related_expenses?: number | null
          status?: Database["public"]["Enums"]["trade_status"]
          title?: string | null
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
            foreignKeyName: "trade_profit_collections_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trade_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number
          attachment_url: string | null
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
        ]
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
      v_cash_available: {
        Row: {
          balance: number | null
          currency: string | null
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
      avg_buy_rate: {
        Args: { _as_of?: string; _currency: string; _quote_currency: string }
        Returns: number
      }
      can_write: { Args: { _user_id: string }; Returns: boolean }
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      recompute_trade_totals: {
        Args: { _trade_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_owner: "milad" | "ali" | "shared" | "other"
      account_type:
        | "cash"
        | "toman_bank"
        | "aed_bank"
        | "foreign_currency"
        | "wallet"
        | "person_holding"
        | "customer_wallet"
      app_role: "admin" | "milad" | "ali" | "viewer"
      brought_in_by: "milad" | "ali" | "customer" | "other"
      brought_in_reason:
        | "capital"
        | "for_exchange"
        | "customer_payment"
        | "temporary_deposit"
        | "other"
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
      profit_status: "pending" | "received" | "waived" | "kept_in_wallet"
      settlement_status:
        | "draft"
        | "awaiting_payment"
        | "payment_received"
        | "awaiting_delivery"
        | "currency_delivered"
        | "awaiting_receipt"
        | "completed"
        | "cancelled"
      trade_status:
        | "draft"
        | "in_progress"
        | "awaiting_profit"
        | "awaiting_docs"
        | "completed"
        | "cancelled"
      txn_owner: "milad" | "ali" | "shared"
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
      account_owner: ["milad", "ali", "shared", "other"],
      account_type: [
        "cash",
        "toman_bank",
        "aed_bank",
        "foreign_currency",
        "wallet",
        "person_holding",
        "customer_wallet",
      ],
      app_role: ["admin", "milad", "ali", "viewer"],
      brought_in_by: ["milad", "ali", "customer", "other"],
      brought_in_reason: [
        "capital",
        "for_exchange",
        "customer_payment",
        "temporary_deposit",
        "other",
      ],
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
      profit_status: ["pending", "received", "waived", "kept_in_wallet"],
      settlement_status: [
        "draft",
        "awaiting_payment",
        "payment_received",
        "awaiting_delivery",
        "currency_delivered",
        "awaiting_receipt",
        "completed",
        "cancelled",
      ],
      trade_status: [
        "draft",
        "in_progress",
        "awaiting_profit",
        "awaiting_docs",
        "completed",
        "cancelled",
      ],
      txn_owner: ["milad", "ali", "shared"],
    },
  },
} as const
