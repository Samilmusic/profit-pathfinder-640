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
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deposit_account_id: string
          entry_date: string
          id: string
          notes: string | null
          reason: Database["public"]["Enums"]["brought_in_reason"]
          sender_account_name: string | null
          sender_account_number: string | null
          sender_bank_name: string | null
          source_name: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          brought_by: Database["public"]["Enums"]["brought_in_by"]
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          deposit_account_id: string
          entry_date?: string
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["brought_in_reason"]
          sender_account_name?: string | null
          sender_account_number?: string | null
          sender_bank_name?: string | null
          source_name?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          brought_by?: Database["public"]["Enums"]["brought_in_by"]
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deposit_account_id?: string
          entry_date?: string
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["brought_in_reason"]
          sender_account_name?: string | null
          sender_account_number?: string | null
          sender_bank_name?: string | null
          source_name?: string | null
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
          id: string
          is_business: boolean
          notes: string | null
          paid_by: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id: string
          reduces_profit: boolean
          related_buy_id: string | null
          related_person: string | null
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
          id?: string
          is_business?: boolean
          notes?: string | null
          paid_by: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id: string
          reduces_profit?: boolean
          related_buy_id?: string | null
          related_person?: string | null
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
          id?: string
          is_business?: boolean
          notes?: string | null
          paid_by?: Database["public"]["Enums"]["paid_by"]
          paid_from_account_id?: string
          reduces_profit?: boolean
          related_buy_id?: string | null
          related_person?: string | null
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
      currency_inventory: {
        Row: {
          currency: string | null
          total_amount: number | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
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
      fee_kind: "fixed" | "percent" | "manual"
      holder_type: "milad" | "ali" | "customer" | "other"
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
      paid_by: "milad" | "ali"
      payment_method:
        | "bank_transfer"
        | "cash_delivery"
        | "currency_delivery"
        | "internal"
        | "international"
        | "other"
      settlement_status:
        | "draft"
        | "awaiting_payment"
        | "payment_received"
        | "awaiting_delivery"
        | "currency_delivered"
        | "awaiting_receipt"
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
      fee_kind: ["fixed", "percent", "manual"],
      holder_type: ["milad", "ali", "customer", "other"],
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
      paid_by: ["milad", "ali"],
      payment_method: [
        "bank_transfer",
        "cash_delivery",
        "currency_delivery",
        "internal",
        "international",
        "other",
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
      ],
      txn_owner: ["milad", "ali", "shared"],
    },
  },
} as const
