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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent: string
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          idea_id: string | null
          input: Json | null
          output: Json | null
          status: string
        }
        Insert: {
          agent: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          idea_id?: string | null
          input?: Json | null
          output?: Json | null
          status?: string
        }
        Update: {
          agent?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          idea_id?: string | null
          input?: Json | null
          output?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "content_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      audiences: {
        Row: {
          channels: string[]
          created_at: string
          description: string | null
          id: string
          motivations: string[]
          name: string
          name_ar: string | null
          pain_points: string[]
          updated_at: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          description?: string | null
          id?: string
          motivations?: string[]
          name: string
          name_ar?: string | null
          pain_points?: string[]
          updated_at?: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          description?: string | null
          id?: string
          motivations?: string[]
          name?: string
          name_ar?: string | null
          pain_points?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      brand_profile: {
        Row: {
          brand_name: string
          contact_email: string | null
          created_at: string
          forbidden: string[]
          id: string
          key_messages: string[]
          languages: string[]
          markets: string[]
          positioning: string | null
          tagline: string | null
          tone_of_voice: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          brand_name: string
          contact_email?: string | null
          created_at?: string
          forbidden?: string[]
          id?: string
          key_messages?: string[]
          languages?: string[]
          markets?: string[]
          positioning?: string | null
          tagline?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          brand_name?: string
          contact_email?: string | null
          created_at?: string
          forbidden?: string[]
          id?: string
          key_messages?: string[]
          languages?: string[]
          markets?: string[]
          positioning?: string | null
          tagline?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          description_ar: string | null
          id: string
          name: string
          name_ar: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_ar?: string | null
          id?: string
          name: string
          name_ar?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          description_ar?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_ideas: {
        Row: {
          angle: string | null
          audience_id: string | null
          created_at: string
          created_by: string | null
          goal: string
          id: string
          planned_date: string
          product_id: string | null
          research_notes: string | null
          status: string
          topic: string
          topic_ar: string | null
          updated_at: string
        }
        Insert: {
          angle?: string | null
          audience_id?: string | null
          created_at?: string
          created_by?: string | null
          goal?: string
          id?: string
          planned_date?: string
          product_id?: string | null
          research_notes?: string | null
          status?: string
          topic: string
          topic_ar?: string | null
          updated_at?: string
        }
        Update: {
          angle?: string | null
          audience_id?: string | null
          created_at?: string
          created_by?: string | null
          goal?: string
          id?: string
          planned_date?: string
          product_id?: string | null
          research_notes?: string | null
          status?: string
          topic?: string
          topic_ar?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_ideas_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_ideas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      post_analytics: {
        Row: {
          clicks: number
          created_at: string
          engagements: number
          id: string
          impressions: number
          leads: number
          measured_on: string
          post_id: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          engagements?: number
          id?: string
          impressions?: number
          leads?: number
          measured_on?: string
          post_id: string
        }
        Update: {
          clicks?: number
          created_at?: string
          engagements?: number
          id?: string
          impressions?: number
          leads?: number
          measured_on?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_analytics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          body_ar: string | null
          body_en: string | null
          created_at: string
          hashtags: string[]
          id: string
          idea_id: string | null
          image_prompt: string | null
          image_url: string | null
          platform: string
          published_at: string | null
          published_url: string | null
          review_notes: string | null
          review_score: number | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          idea_id?: string | null
          image_prompt?: string | null
          image_url?: string | null
          platform: string
          published_at?: string | null
          published_url?: string | null
          review_notes?: string | null
          review_score?: number | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          body_ar?: string | null
          body_en?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          idea_id?: string | null
          image_prompt?: string | null
          image_url?: string | null
          platform?: string
          published_at?: string | null
          published_url?: string | null
          review_notes?: string | null
          review_score?: number | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "content_ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          image_url: string
          is_primary: boolean
          product_id: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url: string
          is_primary?: boolean
          product_id: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          image_url?: string
          is_primary?: boolean
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          description_ar: string | null
          features: string[]
          finishes: string[]
          id: string
          is_active: boolean
          materials: string | null
          name: string
          name_ar: string | null
          price_egp: number | null
          product_url: string | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          description_ar?: string | null
          features?: string[]
          finishes?: string[]
          id?: string
          is_active?: boolean
          materials?: string | null
          name: string
          name_ar?: string | null
          price_egp?: number | null
          product_url?: string | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          description_ar?: string | null
          features?: string[]
          finishes?: string[]
          id?: string
          is_active?: boolean
          materials?: string | null
          name?: string
          name_ar?: string | null
          price_egp?: number | null
          product_url?: string | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          country: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          location: string | null
          name: string
          products_used: string[]
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          name: string
          products_used?: string[]
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          name?: string
          products_used?: string[]
          updated_at?: string
        }
        Relationships: []
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
    Enums: {},
  },
} as const
