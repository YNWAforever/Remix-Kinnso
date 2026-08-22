export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      affiliate_network_events: {
        Row: {
          affiliate_network_program_id: string | null
          booked_at: string | null
          created_at: string
          creator_id: string | null
          currency: string | null
          event_state: string
          external_action_id: string
          external_updated_at: string | null
          id: string
          mission_id: string | null
          mission_participant_id: string | null
          network: string
          price_amount: number | null
          profit_amount: number | null
          raw_response_checksum: string | null
          sub_id: string | null
          updated_at: string
        }
        Insert: {
          affiliate_network_program_id?: string | null
          booked_at?: string | null
          created_at?: string
          creator_id?: string | null
          currency?: string | null
          event_state?: string
          external_action_id: string
          external_updated_at?: string | null
          id?: string
          mission_id?: string | null
          mission_participant_id?: string | null
          network: string
          price_amount?: number | null
          profit_amount?: number | null
          raw_response_checksum?: string | null
          sub_id?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_network_program_id?: string | null
          booked_at?: string | null
          created_at?: string
          creator_id?: string | null
          currency?: string | null
          event_state?: string
          external_action_id?: string
          external_updated_at?: string | null
          id?: string
          mission_id?: string | null
          mission_participant_id?: string | null
          network?: string
          price_amount?: number | null
          profit_amount?: number | null
          raw_response_checksum?: string | null
          sub_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_network_events_affiliate_network_program_id_fkey"
            columns: ["affiliate_network_program_id"]
            isOneToOne: false
            referencedRelation: "affiliate_network_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_network_events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_network_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_network_events_mission_participant_id_fkey"
            columns: ["mission_participant_id"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_network_programs: {
        Row: {
          category: string | null
          created_at: string
          default_commission_description: string | null
          default_currency: string | null
          description: string | null
          external_program_id: string
          id: string
          join_policy: string
          metadata: Json
          network: string
          program_name: string
          program_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_commission_description?: string | null
          default_currency?: string | null
          description?: string | null
          external_program_id: string
          id?: string
          join_policy?: string
          metadata?: Json
          network: string
          program_name: string
          program_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          default_commission_description?: string | null
          default_currency?: string | null
          description?: string | null
          external_program_id?: string
          id?: string
          join_policy?: string
          metadata?: Json
          network?: string
          program_name?: string
          program_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      affiliate_partner_links: {
        Row: {
          affiliate_network_program_id: string
          created_at: string
          creator_id: string
          external_status: string
          generated_at: string
          id: string
          mission_id: string
          mission_participant_id: string
          network: string
          original_url: string
          partner_url: string
          sub_id: string
          updated_at: string
        }
        Insert: {
          affiliate_network_program_id: string
          created_at?: string
          creator_id: string
          external_status?: string
          generated_at?: string
          id?: string
          mission_id: string
          mission_participant_id: string
          network: string
          original_url: string
          partner_url: string
          sub_id: string
          updated_at?: string
        }
        Update: {
          affiliate_network_program_id?: string
          created_at?: string
          creator_id?: string
          external_status?: string
          generated_at?: string
          id?: string
          mission_id?: string
          mission_participant_id?: string
          network?: string
          original_url?: string
          partner_url?: string
          sub_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_partner_links_affiliate_network_program_id_fkey"
            columns: ["affiliate_network_program_id"]
            isOneToOne: false
            referencedRelation: "affiliate_network_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_partner_links_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_partner_links_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_partner_links_mission_participant_id_fkey"
            columns: ["mission_participant_id"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          anon_session_id: string | null
          content: string
          created_at: string
          id: string
          rating: string | null
          role: string
          tool_calls: Json | null
          traveler_user_id: string | null
        }
        Insert: {
          anon_session_id?: string | null
          content: string
          created_at?: string
          id?: string
          rating?: string | null
          role: string
          tool_calls?: Json | null
          traveler_user_id?: string | null
        }
        Update: {
          anon_session_id?: string | null
          content?: string
          created_at?: string
          id?: string
          rating?: string | null
          role?: string
          tool_calls?: Json | null
          traveler_user_id?: string | null
        }
        Relationships: []
      }
      agent_rate_limits: {
        Row: {
          ip: string
          request_count: number
          window_start: string
        }
        Insert: {
          ip: string
          request_count?: number
          window_start?: string
        }
        Update: {
          ip?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
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
      article_experience_overrides: {
        Row: {
          article_id: string
          created_at: string
          experience_id: string
          id: string
          sort_order: number
        }
        Insert: {
          article_id: string
          created_at?: string
          experience_id: string
          id?: string
          sort_order?: number
        }
        Update: {
          article_id?: string
          created_at?: string
          experience_id?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_experience_overrides_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_experience_overrides_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
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
      article_guide_overrides: {
        Row: {
          article_id: string
          created_at: string
          guide_id: string
          id: string
          sort_order: number
        }
        Insert: {
          article_id: string
          created_at?: string
          guide_id: string
          id?: string
          sort_order?: number
        }
        Update: {
          article_id?: string
          created_at?: string
          guide_id?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_guide_overrides_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_guide_overrides_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
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
      booking_events: {
        Row: {
          booking_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settlements: {
        Row: {
          booking_id: string
          created_at: string
          creator_commission_amount: number | null
          creator_commission_status: string | null
          currency: string
          id: string
          kinnso_commission_amount: number
          kinnso_commission_status: string
          merchant_payout_amount: number
          merchant_payout_status: string
          ops_note: string | null
          status: string
          updated_at: string
          updated_by_ops_member_id: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          creator_commission_amount?: number | null
          creator_commission_status?: string | null
          currency: string
          id?: string
          kinnso_commission_amount: number
          kinnso_commission_status?: string
          merchant_payout_amount: number
          merchant_payout_status?: string
          ops_note?: string | null
          status?: string
          updated_at?: string
          updated_by_ops_member_id?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          creator_commission_amount?: number | null
          creator_commission_status?: string | null
          currency?: string
          id?: string
          kinnso_commission_amount?: number
          kinnso_commission_status?: string
          merchant_payout_amount?: number
          merchant_payout_status?: string
          ops_note?: string | null
          status?: string
          updated_at?: string
          updated_by_ops_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_settlements_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_settlements_updated_by_ops_member_id_fkey"
            columns: ["updated_by_ops_member_id"]
            isOneToOne: false
            referencedRelation: "kinnso_ops_members"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          availability_id: string
          created_at: string
          creator_id: string | null
          currency: string
          experience_id: string
          guest_email: string | null
          guide_id: string | null
          id: string
          qty: number
          source_surface: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          total_amount: number
          traveler_user_id: string | null
          unit_amount: number
          updated_at: string
        }
        Insert: {
          availability_id: string
          created_at?: string
          creator_id?: string | null
          currency: string
          experience_id: string
          guest_email?: string | null
          guide_id?: string | null
          id?: string
          qty: number
          source_surface?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount: number
          traveler_user_id?: string | null
          unit_amount: number
          updated_at?: string
        }
        Update: {
          availability_id?: string
          created_at?: string
          creator_id?: string | null
          currency?: string
          experience_id?: string
          guest_email?: string | null
          guide_id?: string | null
          id?: string
          qty?: number
          source_surface?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          total_amount?: number
          traveler_user_id?: string | null
          unit_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_availability_id_fkey"
            columns: ["availability_id"]
            isOneToOne: false
            referencedRelation: "experience_availability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_rate_limits: {
        Row: {
          ip: string
          request_count: number
          window_start: string
        }
        Insert: {
          ip: string
          request_count?: number
          window_start?: string
        }
        Update: {
          ip?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      community_sessions: {
        Row: {
          created_at: string
          description: string
          destination_tags: string[]
          destination_tags_ci: string[] | null
          duration_minutes: number
          embed_url: string | null
          host_creator_id: string
          id: string
          replay_url: string | null
          slug: string
          starts_at: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          destination_tags?: string[]
          destination_tags_ci?: string[] | null
          duration_minutes: number
          embed_url?: string | null
          host_creator_id: string
          id?: string
          replay_url?: string | null
          slug: string
          starts_at: string
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          destination_tags?: string[]
          destination_tags_ci?: string[] | null
          duration_minutes?: number
          embed_url?: string | null
          host_creator_id?: string
          id?: string
          replay_url?: string | null
          slug?: string
          starts_at?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_sessions_host_creator_id_fkey"
            columns: ["host_creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_messages: {
        Row: {
          archived: boolean
          content: string
          created_at: string
          creator_id: string
          id: string
          role: string
          tool_calls: Json | null
        }
        Insert: {
          archived?: boolean
          content: string
          created_at?: string
          creator_id: string
          id?: string
          role: string
          tool_calls?: Json | null
        }
        Update: {
          archived?: boolean
          content?: string
          created_at?: string
          creator_id?: string
          id?: string
          role?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_messages_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_contribution: {
        Row: {
          contribution_points: number
          creator_id: string
          tier: string
          tier_updated_at: string | null
          updated_at: string
        }
        Insert: {
          contribution_points?: number
          creator_id: string
          tier?: string
          tier_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          contribution_points?: number
          creator_id?: string
          tier?: string
          tier_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_contribution_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_contribution_events: {
        Row: {
          created_at: string
          creator_id: string
          event_type: string
          id: string
          points: number
          source_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          event_type: string
          id?: string
          points: number
          source_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          event_type?: string
          id?: string
          points?: number
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_contribution_events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_dna: {
        Row: {
          ai_draft: Json | null
          created_at: string
          creator_id: string
          draft_ready_at: string | null
          final: Json | null
          id: string
          model: string | null
          scan_job_id: string | null
          source: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_draft?: Json | null
          created_at?: string
          creator_id: string
          draft_ready_at?: string | null
          final?: Json | null
          id?: string
          model?: string | null
          scan_job_id?: string | null
          source?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_draft?: Json | null
          created_at?: string
          creator_id?: string
          draft_ready_at?: string | null
          final?: Json | null
          id?: string
          model?: string | null
          scan_job_id?: string | null
          source?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_dna_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_dna_scan_job_id_fkey"
            columns: ["scan_job_id"]
            isOneToOne: false
            referencedRelation: "creator_scan_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_scan_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          creator_id: string
          error: string | null
          id: string
          progress: Json
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          creator_id: string
          error?: string | null
          id?: string
          progress?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          creator_id?: string
          error?: string | null
          id?: string
          progress?: Json
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_scan_jobs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_social_handles: {
        Row: {
          created_at: string
          creator_id: string
          handle: string
          id: string
          platform: string
          url: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          handle: string
          id?: string
          platform: string
          url?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          handle?: string
          id?: string
          platform?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_social_handles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creators: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
          is_listed: boolean
          public_profile: Json | null
          status: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id: string
          is_listed?: boolean
          public_profile?: Json | null
          status?: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          is_listed?: boolean
          public_profile?: Json | null
          status?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      destinations: {
        Row: {
          created_at: string
          description: string | null
          hero_image_url: string | null
          id: string
          match_terms: string[]
          name: string
          published_at: string | null
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          hero_image_url?: string | null
          id?: string
          match_terms?: string[]
          name: string
          published_at?: string | null
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          hero_image_url?: string | null
          id?: string
          match_terms?: string[]
          name?: string
          published_at?: string | null
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      enquiries: {
        Row: {
          created_at: string
          creator_id: string | null
          email: string
          id: string
          merchant_profile_id: string | null
          message: string
          name: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id?: string | null
          email: string
          id?: string
          merchant_profile_id?: string | null
          message: string
          name: string
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string | null
          email?: string
          id?: string
          merchant_profile_id?: string | null
          message?: string
          name?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiries_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_rate_limits: {
        Row: {
          ip_hash: string
          request_count: number
          window_start: string
        }
        Insert: {
          ip_hash: string
          request_count?: number
          window_start: string
        }
        Update: {
          ip_hash?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      experience_availability: {
        Row: {
          booked_count: number
          capacity: number
          created_at: string
          date: string
          experience_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          booked_count?: number
          capacity: number
          created_at?: string
          date: string
          experience_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          booked_count?: number
          capacity?: number
          created_at?: string
          date?: string
          experience_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_availability_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_saves: {
        Row: {
          created_at: string
          experience_id: string
          id: string
          traveler_user_id: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          id?: string
          traveler_user_id: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          id?: string
          traveler_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_saves_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
        ]
      }
      experiences: {
        Row: {
          city: string
          cover_url: string | null
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number | null
          id: string
          merchant_profile_id: string
          price_amount: number
          published_at: string | null
          saves_count: number
          slug: string
          status: string
          summary: string | null
          title: string
          tsv: unknown
          updated_at: string
        }
        Insert: {
          city: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          merchant_profile_id: string
          price_amount: number
          published_at?: string | null
          saves_count?: number
          slug: string
          status?: string
          summary?: string | null
          title: string
          tsv?: unknown
          updated_at?: string
        }
        Update: {
          city?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          merchant_profile_id?: string
          price_amount?: number
          published_at?: string | null
          saves_count?: number
          slug?: string
          status?: string
          summary?: string | null
          title?: string
          tsv?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiences_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_interest_signups: {
        Row: {
          created_at: string
          email: string
          feature: string
          id: string
          locale: string
        }
        Insert: {
          created_at?: string
          email: string
          feature: string
          id?: string
          locale: string
        }
        Update: {
          created_at?: string
          email?: string
          feature?: string
          id?: string
          locale?: string
        }
        Relationships: []
      }
      guide_saves: {
        Row: {
          created_at: string
          guide_id: string
          id: string
          traveler_user_id: string
        }
        Insert: {
          created_at?: string
          guide_id: string
          id?: string
          traveler_user_id: string
        }
        Update: {
          created_at?: string
          guide_id?: string
          id?: string
          traveler_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guide_saves_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          city: string
          cover_url: string | null
          created_at: string
          creator_handle: string
          creator_id: string
          creator_name: string
          id: string
          published_at: string | null
          saves_count: number
          slug: string
          status: string
          summary: string
          title: string
          tsv: unknown
          updated_at: string
        }
        Insert: {
          city: string
          cover_url?: string | null
          created_at?: string
          creator_handle: string
          creator_id: string
          creator_name: string
          id?: string
          published_at?: string | null
          saves_count?: number
          slug: string
          status?: string
          summary: string
          title: string
          tsv?: unknown
          updated_at?: string
        }
        Update: {
          city?: string
          cover_url?: string | null
          created_at?: string
          creator_handle?: string
          creator_id?: string
          creator_name?: string
          id?: string
          published_at?: string | null
          saves_count?: number
          slug?: string
          status?: string
          summary?: string
          title?: string
          tsv?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guides_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      kinnso_ops_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role: string
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "kinnso_ops_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "kinnso_ops_members"
            referencedColumns: ["id"]
          },
        ]
      }
      kinnso_ops_members: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      merchant_applications: {
        Row: {
          company_name: string
          contact_email: string
          contact_name: string | null
          created_at: string
          decided_at: string | null
          decided_by_ops_member_id: string | null
          decision_reason: string | null
          id: string
          pitch: string | null
          status: string
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          company_name: string
          contact_email: string
          contact_name?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_ops_member_id?: string | null
          decision_reason?: string | null
          id?: string
          pitch?: string | null
          status?: string
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          company_name?: string
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by_ops_member_id?: string | null
          decision_reason?: string | null
          id?: string
          pitch?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_applications_decided_by_ops_member_id_fkey"
            columns: ["decided_by_ops_member_id"]
            isOneToOne: false
            referencedRelation: "kinnso_ops_members"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_budget_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          kind: string
          merchant_budget_id: string
          reason: string | null
          source_ref: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          kind: string
          merchant_budget_id: string
          reason?: string | null
          source_ref?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          kind?: string
          merchant_budget_id?: string
          reason?: string | null
          source_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_budget_transactions_merchant_budget_id_fkey"
            columns: ["merchant_budget_id"]
            isOneToOne: false
            referencedRelation: "merchant_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_budgets: {
        Row: {
          balance: number
          created_at: string
          currency: string
          enforced: boolean
          id: string
          merchant_profile_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          enforced?: boolean
          id?: string
          merchant_profile_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          enforced?: boolean
          id?: string
          merchant_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_budgets_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: true
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_offers: {
        Row: {
          claimed_count: number
          commission_kind: string
          commission_value: number
          created_at: string
          discount_kind: string
          discount_value: number
          id: string
          merchant_profile_id: string
          mission_id: string | null
          per_visitor_limit: number
          redeemed_count: number
          status: string
          terms: string
          title: string
          total_cap: number | null
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          claimed_count?: number
          commission_kind: string
          commission_value: number
          created_at?: string
          discount_kind: string
          discount_value: number
          id?: string
          merchant_profile_id: string
          mission_id?: string | null
          per_visitor_limit?: number
          redeemed_count?: number
          status?: string
          terms: string
          title: string
          total_cap?: number | null
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          claimed_count?: number
          commission_kind?: string
          commission_value?: number
          created_at?: string
          discount_kind?: string
          discount_value?: number
          id?: string
          merchant_profile_id?: string
          mission_id?: string | null
          per_visitor_limit?: number
          redeemed_count?: number
          status?: string
          terms?: string
          title?: string
          total_cap?: number | null
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_offers_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_offers_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_profiles: {
        Row: {
          city: string | null
          company_name: string
          contact_email: string
          contact_name: string | null
          created_at: string
          id: string
          logo_url: string | null
          slug: string | null
          status: string
          tagline: string | null
          tier: string
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          city?: string | null
          company_name: string
          contact_email: string
          contact_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          slug?: string | null
          status?: string
          tagline?: string | null
          tier?: string
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          slug?: string | null
          status?: string
          tagline?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      merchant_saved_creators: {
        Row: {
          created_at: string
          creator_id: string
          merchant_id: string
          note: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          merchant_id: string
          note?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          merchant_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_saved_creators_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_saved_creators_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_saved_creators_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_milestone_submissions: {
        Row: {
          created_at: string
          id: string
          merchant_feedback: string | null
          mission_milestone_id: string
          mission_participant_id: string
          notes: string | null
          proof_urls: string[]
          review_deadline: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          merchant_feedback?: string | null
          mission_milestone_id: string
          mission_participant_id: string
          notes?: string | null
          proof_urls?: string[]
          review_deadline?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          merchant_feedback?: string | null
          mission_milestone_id?: string
          mission_participant_id?: string
          notes?: string | null
          proof_urls?: string[]
          review_deadline?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_milestone_submissions_mission_milestone_id_fkey"
            columns: ["mission_milestone_id"]
            isOneToOne: false
            referencedRelation: "mission_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_milestone_submissions_mission_participant_id_fkey"
            columns: ["mission_participant_id"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_milestones: {
        Row: {
          created_at: string
          description: string
          due_at: string | null
          id: string
          mission_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          due_at?: string | null
          id?: string
          mission_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          due_at?: string | null
          id?: string
          mission_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_milestones_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_participants: {
        Row: {
          application_note: string | null
          approved_at: string | null
          created_at: string
          creator_id: string
          id: string
          merchant_review_note: string | null
          mission_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          application_note?: string | null
          approved_at?: string | null
          created_at?: string
          creator_id: string
          id?: string
          merchant_review_note?: string | null
          mission_id: string
          source: string
          status: string
          updated_at?: string
        }
        Update: {
          application_note?: string | null
          approved_at?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          merchant_review_note?: string | null
          mission_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_participants_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_participants_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_review_events: {
        Row: {
          id: string
          submission_id: string
          actor_type: string
          actor_id: string | null
          action: string
          reason_category: string | null
          reason_text: string | null
          created_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          actor_type: string
          actor_id?: string | null
          action: string
          reason_category?: string | null
          reason_text?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['mission_review_events']['Insert']>
        Relationships: [
          {
            foreignKeyName: "mission_review_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "mission_milestone_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_settlements: {
        Row: {
          affiliate_commission_amount: number | null
          affiliate_commission_status: string | null
          affiliate_network_event_id: string | null
          amount_currency: string | null
          created_at: string
          creator_commission_amount: number | null
          creator_payout_status: string | null
          id: string
          kinnso_commission_amount: number | null
          kinnso_commission_status: string | null
          merchant_invoice_status: string | null
          merchant_payment_status: string | null
          mission_id: string
          mission_participant_id: string | null
          ops_note: string | null
          paid_fee_amount: number | null
          source: string
          status: string
          updated_at: string
          updated_by_ops_member_id: string | null
        }
        Insert: {
          affiliate_commission_amount?: number | null
          affiliate_commission_status?: string | null
          affiliate_network_event_id?: string | null
          amount_currency?: string | null
          created_at?: string
          creator_commission_amount?: number | null
          creator_payout_status?: string | null
          id?: string
          kinnso_commission_amount?: number | null
          kinnso_commission_status?: string | null
          merchant_invoice_status?: string | null
          merchant_payment_status?: string | null
          mission_id: string
          mission_participant_id?: string | null
          ops_note?: string | null
          paid_fee_amount?: number | null
          source?: string
          status?: string
          updated_at?: string
          updated_by_ops_member_id?: string | null
        }
        Update: {
          affiliate_commission_amount?: number | null
          affiliate_commission_status?: string | null
          affiliate_network_event_id?: string | null
          amount_currency?: string | null
          created_at?: string
          creator_commission_amount?: number | null
          creator_payout_status?: string | null
          id?: string
          kinnso_commission_amount?: number | null
          kinnso_commission_status?: string | null
          merchant_invoice_status?: string | null
          merchant_payment_status?: string | null
          mission_id?: string
          mission_participant_id?: string | null
          ops_note?: string | null
          paid_fee_amount?: number | null
          source?: string
          status?: string
          updated_at?: string
          updated_by_ops_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mission_settlements_affiliate_network_event_id_fkey"
            columns: ["affiliate_network_event_id"]
            isOneToOne: false
            referencedRelation: "affiliate_network_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_settlements_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_settlements_mission_participant_id_fkey"
            columns: ["mission_participant_id"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_settlements_updated_by_ops_member_id_fkey"
            columns: ["updated_by_ops_member_id"]
            isOneToOne: false
            referencedRelation: "kinnso_ops_members"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_social_snapshots: {
        Row: {
          confidence_status: string
          created_at: string
          engagement_count: number | null
          fetched_at: string | null
          follower_count: number | null
          handle: string | null
          id: string
          mission_id: string | null
          mission_milestone_submission_id: string | null
          mission_participant_id: string | null
          platform: string
          post_media_url: string | null
          profile_media_url: string | null
          profile_url: string | null
          proof_url: string | null
          raw_response_checksum: string | null
          updated_at: string
        }
        Insert: {
          confidence_status?: string
          created_at?: string
          engagement_count?: number | null
          fetched_at?: string | null
          follower_count?: number | null
          handle?: string | null
          id?: string
          mission_id?: string | null
          mission_milestone_submission_id?: string | null
          mission_participant_id?: string | null
          platform: string
          post_media_url?: string | null
          profile_media_url?: string | null
          profile_url?: string | null
          proof_url?: string | null
          raw_response_checksum?: string | null
          updated_at?: string
        }
        Update: {
          confidence_status?: string
          created_at?: string
          engagement_count?: number | null
          fetched_at?: string | null
          follower_count?: number | null
          handle?: string | null
          id?: string
          mission_id?: string | null
          mission_milestone_submission_id?: string | null
          mission_participant_id?: string | null
          platform?: string
          post_media_url?: string | null
          profile_media_url?: string | null
          profile_url?: string | null
          proof_url?: string | null
          raw_response_checksum?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_social_snapshots_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_social_snapshots_mission_milestone_submission_id_fkey"
            columns: ["mission_milestone_submission_id"]
            isOneToOne: false
            referencedRelation: "mission_milestone_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_social_snapshots_mission_participant_id_fkey"
            columns: ["mission_participant_id"]
            isOneToOne: false
            referencedRelation: "mission_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_verification_jobs: {
        Row: {
          completed_at: string | null
          confidence_status: string | null
          created_at: string
          creator_id: string
          error: string | null
          id: string
          mission_milestone_submission_id: string
          platform: string | null
          proof_url: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          confidence_status?: string | null
          created_at?: string
          creator_id: string
          error?: string | null
          id?: string
          mission_milestone_submission_id: string
          platform?: string | null
          proof_url?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          confidence_status?: string | null
          created_at?: string
          creator_id?: string
          error?: string | null
          id?: string
          mission_milestone_submission_id?: string
          platform?: string | null
          proof_url?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_verification_jobs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_verification_jobs_mission_milestone_submission_id_fkey"
            columns: ["mission_milestone_submission_id"]
            isOneToOne: false
            referencedRelation: "mission_milestone_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          affiliate_commission_rate: number | null
          affiliate_network_program_id: string | null
          application_instructions: string | null
          auto_approve_policy: string
          coupon_code: string | null
          coupon_description: string | null
          coupon_url: string | null
          created_at: string
          created_by_ops_member_id: string | null
          creator_commission_rate: number | null
          ends_at: string | null
          id: string
          kinnso_commission_rate: number | null
          merchant_profile_id: string | null
          min_tier: string | null
          mission_source: string
          mission_type: string
          paid_fee_amount: number | null
          paid_fee_currency: string | null
          published_at: string | null
          starts_at: string | null
          status: string
          summary: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          affiliate_commission_rate?: number | null
          affiliate_network_program_id?: string | null
          application_instructions?: string | null
          auto_approve_policy?: string
          coupon_code?: string | null
          coupon_description?: string | null
          coupon_url?: string | null
          created_at?: string
          created_by_ops_member_id?: string | null
          creator_commission_rate?: number | null
          ends_at?: string | null
          id?: string
          kinnso_commission_rate?: number | null
          merchant_profile_id?: string | null
          min_tier?: string | null
          mission_source?: string
          mission_type: string
          paid_fee_amount?: number | null
          paid_fee_currency?: string | null
          published_at?: string | null
          starts_at?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          affiliate_commission_rate?: number | null
          affiliate_network_program_id?: string | null
          application_instructions?: string | null
          auto_approve_policy?: string
          coupon_code?: string | null
          coupon_description?: string | null
          coupon_url?: string | null
          created_at?: string
          created_by_ops_member_id?: string | null
          creator_commission_rate?: number | null
          ends_at?: string | null
          id?: string
          kinnso_commission_rate?: number | null
          merchant_profile_id?: string | null
          min_tier?: string | null
          mission_source?: string
          mission_type?: string
          paid_fee_amount?: number | null
          paid_fee_currency?: string | null
          published_at?: string | null
          starts_at?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_affiliate_network_program_id_fkey"
            columns: ["affiliate_network_program_id"]
            isOneToOne: false
            referencedRelation: "affiliate_network_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_created_by_ops_member_id_fkey"
            columns: ["created_by_ops_member_id"]
            isOneToOne: false
            referencedRelation: "kinnso_ops_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missions_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      // Hand-maintained (not from `supabase gen types`) -- `pnpm --filter @kinnso/db gen`
      // reads production via --linked and R10.3's notifications table only exists on this
      // branch's unmerged migrations. Reconcile with a real `gen --local` run once R10.3 is
      // testable against a full local stack.
      notifications: {
        Row: {
          created_at: string
          creator_id: string
          entity_id: string
          entity_type: string
          id: string
          notification_type: string
          payload: Json
          read_at: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          entity_id: string
          entity_type: string
          id?: string
          notification_type: string
          payload?: Json
          read_at?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          notification_type?: string
          payload?: Json
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_claims: {
        Row: {
          analytics_journey_id: string | null
          analytics_locale: string | null
          claim_token_hash: string
          created_at: string
          creator_id: string
          expires_at: string
          guide_id: string | null
          id: string
          offer_id: string
          source_surface: string
          status: string
          visitor_user_id: string
        }
        Insert: {
          analytics_journey_id?: string | null
          analytics_locale?: string | null
          claim_token_hash: string
          created_at?: string
          creator_id: string
          expires_at: string
          guide_id?: string | null
          id?: string
          offer_id: string
          source_surface: string
          status?: string
          visitor_user_id: string
        }
        Update: {
          analytics_journey_id?: string | null
          analytics_locale?: string | null
          claim_token_hash?: string
          created_at?: string
          creator_id?: string
          expires_at?: string
          guide_id?: string | null
          id?: string
          offer_id?: string
          source_surface?: string
          status?: string
          visitor_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_claims_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "merchant_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_claims_visitor_user_id_fkey"
            columns: ["visitor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_redemptions: {
        Row: {
          amount_spent: number | null
          created_at: string
          id: string
          merchant_profile_id: string
          offer_claim_id: string
          redeemed_at: string
          redeemed_by_merchant_user_id: string
          settlement_id: string | null
        }
        Insert: {
          amount_spent?: number | null
          created_at?: string
          id?: string
          merchant_profile_id: string
          offer_claim_id: string
          redeemed_at?: string
          redeemed_by_merchant_user_id: string
          settlement_id?: string | null
        }
        Update: {
          amount_spent?: number | null
          created_at?: string
          id?: string
          merchant_profile_id?: string
          offer_claim_id?: string
          redeemed_at?: string
          redeemed_by_merchant_user_id?: string
          settlement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_redemptions_merchant_profile_id_fkey"
            columns: ["merchant_profile_id"]
            isOneToOne: false
            referencedRelation: "merchant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_offer_claim_id_fkey"
            columns: ["offer_claim_id"]
            isOneToOne: true
            referencedRelation: "offer_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_redeemed_by_merchant_user_id_fkey"
            columns: ["redeemed_by_merchant_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "mission_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_audit_log: {
        Row: {
          action: string
          actor_ops_member_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          reason: string | null
        }
        Insert: {
          action: string
          actor_ops_member_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          reason?: string | null
        }
        Update: {
          action?: string
          actor_ops_member_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_audit_log_actor_ops_member_id_fkey"
            columns: ["actor_ops_member_id"]
            isOneToOne: false
            referencedRelation: "kinnso_ops_members"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_perks: {
        Row: {
          active: boolean
          category: string
          created_at: string
          discount_label: string
          id: string
          min_tier: string | null
          partner_name: string
          redemption_type: string
          redemption_value: string
          slug: string
          sort_order: number
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          discount_label: string
          id?: string
          min_tier?: string | null
          partner_name: string
          redemption_type: string
          redemption_value: string
          slug: string
          sort_order?: number
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          discount_label?: string
          id?: string
          min_tier?: string | null
          partner_name?: string
          redemption_type?: string
          redemption_value?: string
          slug?: string
          sort_order?: number
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      perk_redemptions: {
        Row: {
          created_at: string
          creator_id: string
          id: string
          perk_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          id?: string
          perk_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          id?: string
          perk_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perk_redemptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perk_redemptions_perk_id_fkey"
            columns: ["perk_id"]
            isOneToOne: false
            referencedRelation: "partner_perks"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          booking_id: string
          created_at: string
          experience_id: string
          guide_id: string | null
          id: string
          rating: number
          status: string
          traveler_user_id: string
        }
        Insert: {
          body?: string | null
          booking_id: string
          created_at?: string
          experience_id: string
          guide_id?: string | null
          id?: string
          rating: number
          status?: string
          traveler_user_id: string
        }
        Update: {
          body?: string | null
          booking_id?: string
          created_at?: string
          experience_id?: string
          guide_id?: string | null
          id?: string
          rating?: number
          status?: string
          traveler_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvp_rate_limits: {
        Row: {
          ip: string
          request_count: number
          window_start: string
        }
        Insert: {
          ip: string
          request_count?: number
          window_start?: string
        }
        Update: {
          ip?: string
          request_count?: number
          window_start?: string
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
      session_rsvps: {
        Row: {
          created_at: string
          email: string
          id: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_rsvps_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "community_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          locale: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          locale: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          locale?: string
          user_id?: string | null
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author_name: string
          author_role: string
          created_at: string
          id: string
          locale: string | null
          quote: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          author_name: string
          author_role: string
          created_at?: string
          id?: string
          locale?: string | null
          quote: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          author_role?: string
          created_at?: string
          id?: string
          locale?: string | null
          quote?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      traveler_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          locale: string | null
          marketing_opt_in: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          locale?: string | null
          marketing_opt_in?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          locale?: string | null
          marketing_opt_in?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      traveller_analytics_events: {
        Row: {
          account_id: string | null
          authenticated: boolean
          booking_state: string
          client_event_id: string
          consent_version: string
          entity_id: string | null
          entity_type: string | null
          error_category: string | null
          event_name: string
          id: string
          journey_id: string
          locale: string
          occurred_at: string
          outcome: string | null
          received_at: string
          route_key: string
        }
        Insert: {
          account_id?: string | null
          authenticated?: boolean
          booking_state?: string
          client_event_id: string
          consent_version: string
          entity_id?: string | null
          entity_type?: string | null
          error_category?: string | null
          event_name: string
          id?: string
          journey_id: string
          locale: string
          occurred_at: string
          outcome?: string | null
          received_at?: string
          route_key: string
        }
        Update: {
          account_id?: string | null
          authenticated?: boolean
          booking_state?: string
          client_event_id?: string
          consent_version?: string
          entity_id?: string | null
          entity_type?: string | null
          error_category?: string | null
          event_name?: string
          id?: string
          journey_id?: string
          locale?: string
          occurred_at?: string
          outcome?: string | null
          received_at?: string
          route_key?: string
        }
        Relationships: []
      }
      traveller_analytics_rate_limits: {
        Row: {
          event_count: number
          journey_id: string
          window_start: string
        }
        Insert: {
          event_count?: number
          journey_id: string
          window_start?: string
        }
        Update: {
          event_count?: number
          journey_id?: string
          window_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      destination_index: {
        Row: {
          description: string | null
          experience_count: number | null
          guide_count: number | null
          hero_image_url: string | null
          latest_published_at: string | null
          match_terms: string[] | null
          name: string | null
          slug: string | null
          sort_order: number | null
        }
        Relationships: []
      }
      merchant_public_profiles: {
        Row: {
          city: string | null
          company_name: string | null
          created_at: string | null
          id: string | null
          logo_url: string | null
          slug: string | null
          tagline: string | null
          website_url: string | null
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          slug?: string | null
          tagline?: string | null
          website_url?: string | null
        }
        Update: {
          city?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          slug?: string | null
          tagline?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_mission_invite: {
        Args: { p_mission_id: string }
        Returns: undefined
      }
      admin_accept_ops_invite: { Args: { p_token: string }; Returns: undefined }
      admin_add_creator_note: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      admin_add_merchant_note: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      admin_approve_merchant_application: {
        Args: { p_id: string; p_reason: string }
        Returns: string
      }
      admin_bulk_set_creator_status: {
        Args: { p_ids: string[]; p_reason: string; p_status: string }
        Returns: number
      }
      admin_bulk_set_merchant_status: {
        Args: { p_ids: string[]; p_reason: string; p_status: string }
        Returns: number
      }
      admin_cancel_and_refund_booking: {
        Args: {
          p_booking_id: string
          p_reason: string
          p_stripe_refund_id: string
        }
        Returns: undefined
      }
      admin_cancel_payout: {
        Args: { p_batch_id: string; p_idempotency_key: string; p_reason: string }
        Returns: Json
      }
      admin_create_payout_batch: {
        Args: {
          p_amount: number
          p_creator_id: string
          p_currency: string
          p_idempotency_key: string
          p_reason: string
          p_target_at?: string | null
        }
        Returns: Json
      }
      admin_creator_analytics: { Args: { p_days?: number }; Returns: Json }
      admin_creator_detail: { Args: { p_creator_id: string }; Returns: Json }
      admin_credit_merchant_budget: {
        Args: { p_merchant_profile_id: string; p_amount: number; p_reason: string }
        Returns: undefined
      }
      admin_invite_ops_member: {
        Args: { p_email: string; p_role: string }
        Returns: string
      }
      admin_list_creators: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          handle: string
          id: string
          status: string
        }[]
      }
      admin_list_enquiries: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_status_group?: string
          p_type?: string
        }
        Returns: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          target_id: string
          target_name: string
          target_slug: string
          type: string
          updated_at: string
        }[]
      }
      admin_list_merchants: {
        Args: never
        Returns: {
          company_name: string
          contact_email: string
          created_at: string
          id: string
          status: string
          tier: string
        }[]
      }
      admin_list_ops: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          id: string
          status: string
          user_id: string
        }[]
      }
      admin_list_ops_members: { Args: never; Returns: Json }
      admin_list_payout_batches: { Args: { p_status?: string | null }; Returns: Json }
      admin_mark_payout_paid: { Args: { p_batch_id: string; p_reason: string }; Returns: undefined }
      admin_merchant_analytics: { Args: { p_days?: number }; Returns: Json }
      admin_merchant_detail: { Args: { p_merchant_id: string }; Returns: Json }
      admin_mission_analytics: { Args: { p_days?: number }; Returns: Json }
      admin_mission_attention: { Args: never; Returns: Json }
      admin_overview_counts: {
        Args: never
        Returns: {
          creators: number
          merchants: number
          ops: number
          perks_active: number
          perks_total: number
          redemptions: number
        }[]
      }
      admin_reactivate_ops_member: {
        Args: { p_member_id: string; p_reason: string }
        Returns: undefined
      }
      admin_reinstate_creator: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      admin_reject_merchant_application: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      admin_review_submission: {
        Args: {
          p_submission_id: string
          p_action: string
          p_reason_category: string | null
          p_reason_text: string | null
        }
        Returns: undefined
      }
      admin_revoke_ops_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      admin_search_creators: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_dna?: string
          p_limit?: number
          p_search?: string
          p_statuses?: string[]
          p_tiers?: string[]
          p_verified?: boolean
        }
        Returns: {
          contribution_points: number
          created_at: string
          display_name: string
          dna_status: string
          handle: string
          id: string
          status: string
          tier: string
          verified: boolean
        }[]
      }
      admin_search_merchants: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
          p_search?: string
          p_statuses?: string[]
          p_tiers?: string[]
        }
        Returns: {
          company_name: string
          created_at: string
          id: string
          status: string
          tier: string
        }[]
      }
      admin_set_booking_settlement_status: {
        Args: {
          p_allow_revert?: boolean
          p_creator_commission_status?: string
          p_id: string
          p_kinnso_commission_status?: string
          p_merchant_payout_status?: string
          p_reason?: string
          p_status?: string
        }
        Returns: undefined
      }
      admin_set_budget_enforcement: {
        Args: { p_merchant_profile_id: string; p_enforced: boolean; p_reason: string }
        Returns: undefined
      }
      admin_set_creator_listed: {
        Args: { p_id: string; p_is_listed: boolean; p_reason: string }
        Returns: undefined
      }
      admin_set_creator_status: {
        Args: { p_id: string; p_reason: string; p_status: string }
        Returns: undefined
      }
      admin_set_creator_verified: {
        Args: { p_id: string; p_reason: string; p_verified: boolean }
        Returns: undefined
      }
      admin_set_enquiry_status: {
        Args: { p_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      admin_set_merchant_status: {
        Args: { p_id: string; p_reason: string; p_status: string }
        Returns: undefined
      }
      admin_set_merchant_tier: {
        Args: { p_id: string; p_reason: string; p_tier: string }
        Returns: undefined
      }
      admin_set_mission_auto_approve_policy: {
        Args: { p_mission_id: string; p_policy: string }
        Returns: undefined
      }
      admin_set_ops_member_role: {
        Args: { p_member_id: string; p_reason: string; p_role: string }
        Returns: undefined
      }
      admin_set_payout_processing_window: {
        Args: { p_days: number; p_reason: string }
        Returns: undefined
      }
      admin_set_settlement_status: {
        Args: {
          p_affiliate_commission_status?: string
          p_allow_revert?: boolean
          p_creator_payout_status?: string
          p_id: string
          p_kinnso_commission_status?: string
          p_reason?: string
          p_status?: string
        }
        Returns: undefined
      }
      admin_set_user_status: {
        Args: { p_id: string; p_kind: string; p_status: string }
        Returns: undefined
      }
      admin_traveller_analytics_report: {
        Args: { p_window_end: string; p_window_start: string }
        Returns: {
          attribution_window_days: number
          booking_state: string
          denominator: number
          entity_type: string | null
          locale: string
          metric_key: string
          numerator: number
          rate: number | null
          sample_count: number
          status: string
        }[]
      }
      admin_suspend_ops_member: {
        Args: { p_member_id: string; p_reason: string }
        Returns: undefined
      }
      award_contribution_event: {
        Args: {
          p_creator_id: string
          p_event_type: string
          p_points: number
          p_source_id: string
        }
        Returns: undefined
      }
      check_and_increment_agent_rate_limit: {
        Args: { p_ip: string; p_max_requests: number; p_window_seconds: number }
        Returns: boolean
      }
      check_and_increment_checkout_rate_limit: {
        Args: { p_ip: string; p_max_requests: number; p_window_seconds: number }
        Returns: boolean
      }
      check_and_increment_rsvp_rate_limit: {
        Args: { p_ip: string; p_max_requests: number; p_window_seconds: number }
        Returns: boolean
      }
      check_and_increment_traveller_analytics_ip_rate_limit: {
        Args: { p_ip: string; p_max_requests: number; p_window_seconds: number }
        Returns: boolean
      }
      check_and_increment_traveller_analytics_rate_limit: {
        Args: {
          p_journey_id: string
          p_max_requests: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      claim_offer: {
        Args: {
          p_creator_id: string
          p_guide_id: string | null
          p_journey_id?: string | null
          p_locale?: string | null
          p_offer_id: string
          p_source: string
        }
        Returns: Json
      }
      confirm_booking_from_webhook: {
        Args: {
          p_stripe_checkout_session_id: string
          p_stripe_payment_intent_id: string
        }
        Returns: undefined
      }
      contribution_tier_for_points: {
        Args: { p_points: number }
        Returns: string
      }
      contribution_tier_rank: { Args: { p_tier: string }; Returns: number }
      create_travelpayouts_partner_link: {
        Args: {
          p_affiliate_network_program_id: string
          p_mission_id: string
          p_mission_participant_id: string
          p_original_url: string
          p_partner_url: string
          p_sub_id: string
        }
        Returns: {
          id: string
          partner_url: string
        }[]
      }
      creator_earnings_summary: { Args: never; Returns: Json }
      creator_insights: { Args: never; Returns: Json }
      creator_payout_batches_mine: { Args: never; Returns: Json }
      creator_public_profile_json: { Args: { p_final: Json }; Returns: Json }
      funded_merchant_profiles: { Args: never; Returns: string[] }
      get_attributed_guides_for_merchant: {
        Args: { p_limit?: number; p_merchant_id: string }
        Returns: {
          city: string
          cover_url: string
          creator_handle: string
          saves_count: number
          slug: string
          title: string
        }[]
      }
      get_booking_by_checkout_session: {
        Args: { p_session_id: string }
        Returns: {
          booking_id: string
          currency: string
          experience_id: string
          experience_slug: string
          experience_title: string
          guide_id: string
          qty: number
          status: string
          total_amount: number
          traveler_user_id: string
        }[]
      }
      get_my_offer_claim: {
        Args: { p_claim_id: string }
        Returns: { offer_title: string; merchant_name: string }[]
      }
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
      is_active_ops: { Args: never; Returns: boolean }
      is_active_ops_role: { Args: { p_min: string }; Returns: boolean }
      join_feature_interest: {
        Args: { p_email: string; p_feature: string; p_locale: string }
        Returns: boolean
      }
      list_active_perks: {
        Args: never
        Returns: {
          category: string
          discount_label: string
          id: string
          min_tier: string
          partner_name: string
          redemption_type: string
          slug: string
          sort_order: number
          summary: string
          title: string
        }[]
      }
      list_offers_for_creator: {
        Args: { p_creator_id: string }
        Returns: { id: string; title: string; terms: string; discount_kind: string; discount_value: number; merchant_name: string; valid_to: string }[]
      }
      lowercase_text_array: { Args: { arr: string[] }; Returns: string[] }
      mark_booking_completed: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      merchant_insights: { Args: never; Returns: Json }
      merchant_invite_creator: {
        Args: { p_creator_id: string; p_mission_id: string }
        Returns: string
      }
      merchant_slugify: { Args: { p_text: string }; Returns: string }
      mission_review_event_append: {
        Args: { p_submission_id: string; p_action: string; p_reason_text: string | null }
        Returns: undefined
      }
      notifications_mine: { Args: never; Returns: Json }
      notifications_unread_count: { Args: never; Returns: number }
      ops_audit_log_append: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_reason?: string
        }
        Returns: string
      }
      purge_traveller_analytics_events: { Args: never; Returns: undefined }
      platform_stats: {
        Args: never
        Returns: {
          active_creators: number
          completed_bookings: number
          destinations: number
          published_guides: number
          upcoming_sessions: number
        }[]
      }
      rate_agent_message: {
        Args: {
          p_anon_session_id?: string
          p_message_id: string
          p_rating: string
        }
        Returns: undefined
      }
      recompute_creator_contribution: {
        Args: { p_creator_id: string }
        Returns: undefined
      }
      redeem_offer_claim: {
        Args: { p_raw_token: string; p_amount_spent: number | null }
        Returns: Json
      }
      redeem_perk: {
        Args: { p_perk_id: string }
        Returns: {
          redemption_type: string
          redemption_value: string
        }[]
      }
      revoke_contribution_event: {
        Args: {
          p_creator_id: string
          p_event_type: string
          p_source_id: string
        }
        Returns: undefined
      }
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
      search_experiences: {
        Args: {
          p_city?: string
          p_limit?: number
          p_offset?: number
          p_q?: string
        }
        Returns: {
          city: string
          cover_url: string
          currency: string
          merchant_profile_id: string
          price_amount: number
          published_at: string
          slug: string
          summary: string
          title: string
          total_count: number
        }[]
      }
      search_guides: {
        Args: {
          p_city?: string
          p_limit?: number
          p_offset?: number
          p_q?: string
        }
        Returns: {
          city: string
          cover_url: string
          creator_handle: string
          published_at: string
          saves_count: number
          slug: string
          summary: string
          title: string
          total_count: number
        }[]
      }
      slugify: { Args: { input: string }; Returns: string }
      submit_enquiry: {
        Args: {
          p_creator_id: string
          p_email: string
          p_ip: string
          p_max_requests?: number
          p_merchant_profile_id: string
          p_message: string
          p_name: string
          p_type: string
          p_window_seconds?: number
        }
        Returns: string
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
