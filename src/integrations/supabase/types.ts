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
      driver_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          speed: number | null
          trip_id: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          speed?: number | null
          trip_id: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          speed?: number | null
          trip_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          average_rating: number
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          average_rating?: number
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          average_rating?: number
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      trips: {
        Row: {
          completed_at: string | null
          created_at: string
          destination_lat: number | null
          destination_lng: number | null
          destination_name: string | null
          driver_id: string
          id: string
          origin_lat: number | null
          origin_lng: number | null
          origin_name: string | null
          passenger_id: string | null
          price: number | null
          rating: number | null
          scheduled_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          driver_id: string
          id?: string
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          passenger_id?: string | null
          price?: number | null
          rating?: number | null
          scheduled_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          destination_lat?: number | null
          destination_lng?: number | null
          destination_name?: string | null
          driver_id?: string
          id?: string
          origin_lat?: number | null
          origin_lng?: number | null
          origin_name?: string | null
          passenger_id?: string | null
          price?: number | null
          rating?: number | null
          scheduled_at?: string | null
          status?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          brand: string
          category: string
          cost_per_km: number
          created_at: string
          estimated_consumption: number
          fuel_type: string
          id: string
          is_active: boolean
          license_plate: string
          model: string
          user_id: string
          verification_status: string
          year: number
        }
        Insert: {
          brand: string
          category: string
          cost_per_km?: number
          created_at?: string
          estimated_consumption?: number
          fuel_type: string
          id?: string
          is_active?: boolean
          license_plate: string
          model: string
          user_id: string
          verification_status?: string
          year: number
        }
        Update: {
          brand?: string
          category?: string
          cost_per_km?: number
          created_at?: string
          estimated_consumption?: number
          fuel_type?: string
          id?: string
          is_active?: boolean
          license_plate?: string
          model?: string
          user_id?: string
          verification_status?: string
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_driver_position_history: {
        Args: { p_limit?: number; p_trip_id: string }
        Returns: {
          created_at: string
          latitude: number
          longitude: number
        }[]
      }
      get_latest_driver_location: {
        Args: { p_trip_id: string }
        Returns: {
          created_at: string
          heading: number
          latitude: number
          longitude: number
          speed: number
        }[]
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
