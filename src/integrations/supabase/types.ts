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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      barber_subscription_earnings: {
        Row: {
          amount: number
          barber_id: string
          created_at: string
          id: string
          month: number
          organization_id: string
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          barber_id: string
          created_at?: string
          id?: string
          month: number
          organization_id: string
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          barber_id?: string
          created_at?: string
          id?: string
          month?: number
          organization_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "barber_subscription_earnings_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barber_subscription_earnings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      barbers: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          products_commission: number
          services_commission: number
          status: string
          unit_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          products_commission?: number
          services_commission?: number
          status?: string
          unit_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          products_commission?: number
          services_commission?: number
          status?: string
          unit_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barbers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barbers_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_productions: {
        Row: {
          barber_id: string
          clients_count: number
          commission_earned: number
          created_at: string
          date: string
          id: string
          organization_id: string
          products_count: number
          products_total: number
          services_basic_total: number | null
          services_count: number
          services_extra_total: number | null
          services_total: number
          updated_at: string
        }
        Insert: {
          barber_id: string
          clients_count?: number
          commission_earned?: number
          created_at?: string
          date: string
          id?: string
          organization_id: string
          products_count?: number
          products_total?: number
          services_basic_total?: number | null
          services_count?: number
          services_extra_total?: number | null
          services_total?: number
          updated_at?: string
        }
        Update: {
          barber_id?: string
          clients_count?: number
          commission_earned?: number
          created_at?: string
          date?: string
          id?: string
          organization_id?: string
          products_count?: number
          products_total?: number
          services_basic_total?: number | null
          services_count?: number
          services_extra_total?: number | null
          services_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_productions_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_productions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_integracao: {
        Row: {
          created_at: string
          daily_production_id: string
          data_venda: string
          id: string
          organization_id: string
          unit_id: string
          updated_at: string
          valor_comissao: number
          valor_venda: number
        }
        Insert: {
          created_at?: string
          daily_production_id: string
          data_venda: string
          id?: string
          organization_id: string
          unit_id: string
          updated_at?: string
          valor_comissao?: number
          valor_venda?: number
        }
        Update: {
          created_at?: string
          daily_production_id?: string
          data_venda?: string
          id?: string
          organization_id?: string
          unit_id?: string
          updated_at?: string
          valor_comissao?: number
          valor_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_integracao_daily_production_id_fkey"
            columns: ["daily_production_id"]
            isOneToOne: true
            referencedRelation: "daily_productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_integracao_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_goals: {
        Row: {
          barber_id: string
          created_at: string
          id: string
          month: number
          organization_id: string
          target_commission: number
          updated_at: string
          work_days: number
          year: number
        }
        Insert: {
          barber_id: string
          created_at?: string
          id?: string
          month: number
          organization_id: string
          target_commission: number
          updated_at?: string
          work_days: number
          year: number
        }
        Update: {
          barber_id?: string
          created_at?: string
          id?: string
          month?: number
          organization_id?: string
          target_commission?: number
          updated_at?: string
          work_days?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_goals_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          has_subscription_module: boolean
          id: string
          name: string
          stripe_customer_id: string | null
          subscription_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          has_subscription_module?: boolean
          id?: string
          name: string
          stripe_customer_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          has_subscription_module?: boolean
          id?: string
          name?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_alerts: {
        Row: {
          alerta_tipo: string
          barber_id: string
          created_at: string
          dias_restantes: number | null
          id: string
          mes_referencia: string
          organization_id: string
          percentual_atingido: number | null
          status: string
          updated_at: string
          valor_deficit_r$: number
        }
        Insert: {
          alerta_tipo: string
          barber_id: string
          created_at?: string
          dias_restantes?: number | null
          id?: string
          mes_referencia: string
          organization_id: string
          percentual_atingido?: number | null
          status?: string
          updated_at?: string
          valor_deficit_r$?: number
        }
        Update: {
          alerta_tipo?: string
          barber_id?: string
          created_at?: string
          dias_restantes?: number | null
          id?: string
          mes_referencia?: string
          organization_id?: string
          percentual_atingido?: number | null
          status?: string
          updated_at?: string
          valor_deficit_r$?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_alerts_barber_id_fkey"
            columns: ["barber_id"]
            isOneToOne: false
            referencedRelation: "barbers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ranking_custom_names: {
        Row: {
          created_at: string
          custom_name: string
          id: string
          is_active: boolean
          organization_id: string
          ranking_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          ranking_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          ranking_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          created_at: string
          external_unit_id: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_unit_id?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_unit_id?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_organization_rankings: {
        Args: { p_end_date: string; p_start_date: string; p_unit_id?: string }
        Returns: {
          barber_id: string
          barber_name: string
          clients_count: number
          commission_earned: number
          products_total: number
          services_basic_total: number
          services_extra_total: number
          services_total: number
          unit_name: string
        }[]
      }
      get_user_organization: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "manager" | "barber"
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
      app_role: ["super_admin", "manager", "barber"],
    },
  },
} as const
