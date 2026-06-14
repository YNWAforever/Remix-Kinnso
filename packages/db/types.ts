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
      article_authors: {
        Row: {
          avatar: string | null
          bio: string | null
          id: string
          is_active: boolean
          labels: string[]
          locale: string
          name: string
          slug: string
          title: string | null
        }
        Insert: {
          avatar?: string | null
          bio?: string | null
          id?: string
          is_active?: boolean
          labels?: string[]
          locale: string
          name: string
          slug: string
          title?: string | null
        }
        Update: {
          avatar?: string | null
          bio?: string | null
          id?: string
          is_active?: boolean
          labels?: string[]
          locale?: string
          name?: string
          slug?: string
          title?: string | null
        }
        Relationships: []
      }
      article_faqs: {
        Row: {
          answer: string
          article_id: string
          deleted_at: string | null
          id: string
          locale: string
          question: string
          weight: number
        }
        Insert: {
          answer: string
          article_id: string
          deleted_at?: string | null
          id?: string
          locale: string
          question: string
          weight?: number
        }
        Update: {
          answer?: string
          article_id?: string
          deleted_at?: string | null
          id?: string
          locale?: string
          question?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_faqs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_tag_map: {
        Row: {
          article_id: string
          tag_id: string
        }
        Insert: {
          article_id: string
          tag_id: string
        }
        Update: {
          article_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_tag_map_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_tag_map_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "article_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      article_tag_translations: {
        Row: {
          locale: string
          name: string
          tag_id: string
        }
        Insert: {
          locale: string
          name: string
          tag_id: string
        }
        Update: {
          locale?: string
          name?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_tag_translations_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "article_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      article_tags: {
        Row: {
          id: string
          legacy_tag_id: number | null
          slug: string
        }
        Insert: {
          id?: string
          legacy_tag_id?: number | null
          slug: string
        }
        Update: {
          id?: string
          legacy_tag_id?: number | null
          slug?: string
        }
        Relationships: []
      }
      article_translations: {
        Row: {
          analyze_tags: string[]
          article_id: string
          content: Json | null
          faq_title: string | null
          id: string
          labels: string[]
          locale: string
          meta_description: string | null
          meta_keywords: string | null
          meta_title: string | null
          og_description: string | null
          og_image: string | null
          og_title: string | null
          summary: string | null
          title: string | null
          tsv: unknown
          validated_at: string | null
        }
        Insert: {
          analyze_tags?: string[]
          article_id: string
          content?: Json | null
          faq_title?: string | null
          id?: string
          labels?: string[]
          locale: string
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          summary?: string | null
          title?: string | null
          tsv?: unknown
          validated_at?: string | null
        }
        Update: {
          analyze_tags?: string[]
          article_id?: string
          content?: Json | null
          faq_title?: string | null
          id?: string
          labels?: string[]
          locale?: string
          meta_description?: string | null
          meta_keywords?: string | null
          meta_title?: string | null
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          summary?: string | null
          title?: string | null
          tsv?: unknown
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_translations_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          authors: string[]
          category: string
          created_at: string
          deleted_at: string | null
          edit_at: string | null
          end_at: string | null
          id: string
          is_coupon: boolean
          legacy_post_id: number
          published_at: string | null
          rating: number | null
          regions: string[]
          slug: string
          source: string | null
          source_hash: string | null
          source_synced_at: string | null
          tag_slugs: string[]
          thumbnails: string[]
          updated_at: string
          url: string
          views: number
        }
        Insert: {
          authors?: string[]
          category: string
          created_at?: string
          deleted_at?: string | null
          edit_at?: string | null
          end_at?: string | null
          id?: string
          is_coupon?: boolean
          legacy_post_id: number
          published_at?: string | null
          rating?: number | null
          regions?: string[]
          slug: string
          source?: string | null
          source_hash?: string | null
          source_synced_at?: string | null
          tag_slugs?: string[]
          thumbnails?: string[]
          updated_at?: string
          url: string
          views?: number
        }
        Update: {
          authors?: string[]
          category?: string
          created_at?: string
          deleted_at?: string | null
          edit_at?: string | null
          end_at?: string | null
          id?: string
          is_coupon?: boolean
          legacy_post_id?: number
          published_at?: string | null
          rating?: number | null
          regions?: string[]
          slug?: string
          source?: string | null
          source_hash?: string | null
          source_synced_at?: string | null
          tag_slugs?: string[]
          thumbnails?: string[]
          updated_at?: string
          url?: string
          views?: number
        }
        Relationships: []
      }
      seo_redirects: {
        Row: {
          from_path: string
          id: string
          status_code: number
          to_path: string
        }
        Insert: {
          from_path: string
          id?: string
          status_code?: number
          to_path: string
        }
        Update: {
          from_path?: string
          id?: string
          status_code?: number
          to_path?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_you_may_like: {
        Args: { p_article_id: string; p_limit?: number; p_locale: string }
        Returns: {
          category: string
          published_at: string
          thumbnails: string[]
          title: string
          url: string
        }[]
      }
      increment_article_view: { Args: { p_url: string }; Returns: undefined }
      search_articles: {
        Args: {
          p_category?: string
          p_limit?: number
          p_locale: string
          p_offset?: number
          p_q?: string
          p_region?: string
          p_tag?: string
        }
        Returns: {
          category: string
          edit_at: string
          published_at: string
          rating: number
          summary: string
          thumbnails: string[]
          title: string
          total_count: number
          url: string
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
