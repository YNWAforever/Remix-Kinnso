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
          bio: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
          public_profile: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id: string
          public_profile?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          public_profile?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      guides: {
        Row: {
          city: string
          cover_url: string
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
          updated_at: string
        }
        Insert: {
          city: string
          cover_url: string
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
          updated_at?: string
        }
        Update: {
          city?: string
          cover_url?: string
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
      kinnso_ops_members: {
        Row: {
          created_at: string
          display_name: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      merchant_profiles: {
        Row: {
          company_name: string
          contact_email: string
          contact_name: string | null
          created_at: string
          id: string
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
          id?: string
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
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
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
        ]
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
      award_contribution_event: {
        Args: {
          p_creator_id: string
          p_event_type: string
          p_points: number
          p_source_id: string
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
      creator_public_profile_json: { Args: { p_final: Json }; Returns: Json }
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
      recompute_creator_contribution: {
        Args: { p_creator_id: string }
        Returns: undefined
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
      slugify: { Args: { input: string }; Returns: string }
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
