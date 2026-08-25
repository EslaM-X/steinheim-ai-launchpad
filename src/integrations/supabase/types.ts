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
      ad_variants: {
        Row: {
          aspect_ratio: string
          asset_id: string | null
          campaign_id: string
          caption: string | null
          created_at: string
          cta: string | null
          duration_seconds: number | null
          hashtags: string[]
          headline: string | null
          id: string
          platform: string
          primary_text: string | null
          status: string
          updated_at: string
          variant_key: string
        }
        Insert: {
          aspect_ratio?: string
          asset_id?: string | null
          campaign_id: string
          caption?: string | null
          created_at?: string
          cta?: string | null
          duration_seconds?: number | null
          hashtags?: string[]
          headline?: string | null
          id?: string
          platform: string
          primary_text?: string | null
          status?: string
          updated_at?: string
          variant_key: string
        }
        Update: {
          aspect_ratio?: string
          asset_id?: string | null
          campaign_id?: string
          caption?: string | null
          created_at?: string
          cta?: string | null
          duration_seconds?: number | null
          hashtags?: string[]
          headline?: string | null
          id?: string
          platform?: string
          primary_text?: string | null
          status?: string
          updated_at?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_variants_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_variants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
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
          business_context: string | null
          buying_criteria: string[]
          channels: string[]
          created_at: string
          cta_preference: string | null
          decision_authority: string | null
          description: string | null
          goals: string[]
          id: string
          language: string
          motivations: string[]
          name: string
          name_ar: string | null
          objections: string[]
          pain_points: string[]
          preferred_content: string[]
          role: string | null
          updated_at: string
        }
        Insert: {
          business_context?: string | null
          buying_criteria?: string[]
          channels?: string[]
          created_at?: string
          cta_preference?: string | null
          decision_authority?: string | null
          description?: string | null
          goals?: string[]
          id?: string
          language?: string
          motivations?: string[]
          name: string
          name_ar?: string | null
          objections?: string[]
          pain_points?: string[]
          preferred_content?: string[]
          role?: string | null
          updated_at?: string
        }
        Update: {
          business_context?: string | null
          buying_criteria?: string[]
          channels?: string[]
          created_at?: string
          cta_preference?: string | null
          decision_authority?: string | null
          description?: string | null
          goals?: string[]
          id?: string
          language?: string
          motivations?: string[]
          name?: string
          name_ar?: string | null
          objections?: string[]
          pain_points?: string[]
          preferred_content?: string[]
          role?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      automation_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          endpoint: string
          id: string
          idempotency_key: string | null
          nonce: string
          response: Json | null
          status_code: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          endpoint: string
          id?: string
          idempotency_key?: string | null
          nonce: string
          response?: Json | null
          status_code?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          idempotency_key?: string | null
          nonce?: string
          response?: Json | null
          status_code?: number | null
        }
        Relationships: []
      }
      brand_profile: {
        Row: {
          approved_ctas: string[]
          brand_name: string
          brand_promises: string[]
          brand_story: string | null
          competitive_positioning: string | null
          contact_email: string | null
          created_at: string
          forbidden: string[]
          id: string
          key_messages: string[]
          languages: string[]
          markets: string[]
          mission: string | null
          positioning: string | null
          tagline: string | null
          tone_of_voice: string | null
          updated_at: string
          values_list: string[]
          vision: string | null
          vocabulary_avoid: string[]
          vocabulary_use: string[]
          website: string | null
        }
        Insert: {
          approved_ctas?: string[]
          brand_name: string
          brand_promises?: string[]
          brand_story?: string | null
          competitive_positioning?: string | null
          contact_email?: string | null
          created_at?: string
          forbidden?: string[]
          id?: string
          key_messages?: string[]
          languages?: string[]
          markets?: string[]
          mission?: string | null
          positioning?: string | null
          tagline?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          values_list?: string[]
          vision?: string | null
          vocabulary_avoid?: string[]
          vocabulary_use?: string[]
          website?: string | null
        }
        Update: {
          approved_ctas?: string[]
          brand_name?: string
          brand_promises?: string[]
          brand_story?: string | null
          competitive_positioning?: string | null
          contact_email?: string | null
          created_at?: string
          forbidden?: string[]
          id?: string
          key_messages?: string[]
          languages?: string[]
          markets?: string[]
          mission?: string | null
          positioning?: string | null
          tagline?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          values_list?: string[]
          vision?: string | null
          vocabulary_avoid?: string[]
          vocabulary_use?: string[]
          website?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          audience_id: string | null
          audience_segment: string | null
          brief: Json
          budget_egp: number | null
          created_at: string
          created_by: string | null
          directions: string[]
          duration_seconds: number
          id: string
          language: string
          market: string
          mode: string
          name: string
          objective: string
          platforms: string[]
          product_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audience_id?: string | null
          audience_segment?: string | null
          brief?: Json
          budget_egp?: number | null
          created_at?: string
          created_by?: string | null
          directions?: string[]
          duration_seconds?: number
          id?: string
          language?: string
          market?: string
          mode?: string
          name: string
          objective?: string
          platforms?: string[]
          product_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audience_id?: string | null
          audience_segment?: string | null
          brief?: Json
          budget_egp?: number | null
          created_at?: string
          created_by?: string | null
          directions?: string[]
          duration_seconds?: number
          id?: string
          language?: string
          market?: string
          mode?: string
          name?: string
          objective?: string
          platforms?: string[]
          product_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_sources: {
        Row: {
          base_url: string
          catalog_path: string
          created_at: string
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          last_sync_summary: Json | null
          locale_paths: Json
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          base_url: string
          catalog_path?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          last_sync_summary?: Json | null
          locale_paths?: Json
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          catalog_path?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          last_sync_summary?: Json | null
          locale_paths?: Json
          name?: string
          status?: string
          updated_at?: string
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
      claims: {
        Row: {
          approved_for: string[]
          claim_text: string
          claim_text_ar: string | null
          claim_type: string
          confidence: string
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          evidence: string | null
          expires_at: string | null
          extracted_by: string
          forbidden_for: string[]
          id: string
          notes: string | null
          source_fingerprint: string | null
          source_id: string | null
          source_tier: number
          source_type: string
          source_url: string | null
          updated_at: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          approved_for?: string[]
          claim_text: string
          claim_text_ar?: string | null
          claim_type?: string
          confidence?: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          evidence?: string | null
          expires_at?: string | null
          extracted_by?: string
          forbidden_for?: string[]
          id?: string
          notes?: string | null
          source_fingerprint?: string | null
          source_id?: string | null
          source_tier?: number
          source_type?: string
          source_url?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          approved_for?: string[]
          claim_text?: string
          claim_text_ar?: string | null
          claim_type?: string
          confidence?: string
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          evidence?: string | null
          expires_at?: string | null
          extracted_by?: string
          forbidden_for?: string[]
          id?: string
          notes?: string | null
          source_fingerprint?: string | null
          source_id?: string | null
          source_tier?: number
          source_type?: string
          source_url?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: []
      }
      content_ideas: {
        Row: {
          angle: string | null
          audience_id: string | null
          content_fingerprint: string | null
          content_format: string | null
          content_type: string | null
          created_at: string
          created_by: string | null
          fingerprint_terms: string[]
          funnel_stage: string | null
          goal: string
          id: string
          planned_date: string
          product_id: string | null
          research_notes: string | null
          similarity_score: number | null
          status: string
          strategic_angle: string | null
          topic: string
          topic_ar: string | null
          updated_at: string
        }
        Insert: {
          angle?: string | null
          audience_id?: string | null
          content_fingerprint?: string | null
          content_format?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          fingerprint_terms?: string[]
          funnel_stage?: string | null
          goal?: string
          id?: string
          planned_date?: string
          product_id?: string | null
          research_notes?: string | null
          similarity_score?: number | null
          status?: string
          strategic_angle?: string | null
          topic: string
          topic_ar?: string | null
          updated_at?: string
        }
        Update: {
          angle?: string | null
          audience_id?: string | null
          content_fingerprint?: string | null
          content_format?: string | null
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          fingerprint_terms?: string[]
          funnel_stage?: string | null
          goal?: string
          id?: string
          planned_date?: string
          product_id?: string | null
          research_notes?: string | null
          similarity_score?: number | null
          status?: string
          strategic_angle?: string | null
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
      creative_assets: {
        Row: {
          asset_type: string
          campaign_id: string | null
          created_at: string
          external_url: string | null
          id: string
          meta: Json
          mode: string
          model_used: string | null
          shot_id: string | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          asset_type?: string
          campaign_id?: string | null
          created_at?: string
          external_url?: string | null
          id?: string
          meta?: Json
          mode?: string
          model_used?: string | null
          shot_id?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          asset_type?: string
          campaign_id?: string | null
          created_at?: string
          external_url?: string | null
          id?: string
          meta?: Json
          mode?: string
          model_used?: string | null
          shot_id?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_assets_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_concepts: {
        Row: {
          big_idea: string
          campaign_id: string
          created_at: string
          emotional_trigger: string | null
          hook: string | null
          id: string
          script_ar: string | null
          script_en: string | null
          selected: boolean
          slot: number
          title: string
          updated_at: string
          visual_language: string | null
          why_it_works: string | null
        }
        Insert: {
          big_idea: string
          campaign_id: string
          created_at?: string
          emotional_trigger?: string | null
          hook?: string | null
          id?: string
          script_ar?: string | null
          script_en?: string | null
          selected?: boolean
          slot?: number
          title: string
          updated_at?: string
          visual_language?: string | null
          why_it_works?: string | null
        }
        Update: {
          big_idea?: string
          campaign_id?: string
          created_at?: string
          emotional_trigger?: string | null
          hook?: string | null
          id?: string
          script_ar?: string | null
          script_en?: string | null
          selected?: boolean
          slot?: number
          title?: string
          updated_at?: string
          visual_language?: string | null
          why_it_works?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creative_concepts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_references: {
        Row: {
          campaign_id: string | null
          created_at: string
          creative_dna: Json
          id: string
          improvement_notes: string | null
          kind: string
          notes: string | null
          source_url: string | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          creative_dna?: Json
          id?: string
          improvement_notes?: string | null
          kind?: string
          notes?: string | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          creative_dna?: Json
          id?: string
          improvement_notes?: string | null
          kind?: string
          notes?: string | null
          source_url?: string | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_references_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      creative_reviews: {
        Row: {
          ai_approved: boolean
          ai_artifact_score: number | null
          band: string | null
          breakdown: Json
          campaign_id: string | null
          created_at: string
          final_score: number | null
          hard_fail: boolean
          hard_fail_reasons: Json
          human_approved_at: string | null
          human_approved_by: string | null
          id: string
          notes: string | null
          penalties: Json
          raw_score: number | null
          scope: string
          shot_id: string | null
          updated_at: string
        }
        Insert: {
          ai_approved?: boolean
          ai_artifact_score?: number | null
          band?: string | null
          breakdown?: Json
          campaign_id?: string | null
          created_at?: string
          final_score?: number | null
          hard_fail?: boolean
          hard_fail_reasons?: Json
          human_approved_at?: string | null
          human_approved_by?: string | null
          id?: string
          notes?: string | null
          penalties?: Json
          raw_score?: number | null
          scope?: string
          shot_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_approved?: boolean
          ai_artifact_score?: number | null
          band?: string | null
          breakdown?: Json
          campaign_id?: string | null
          created_at?: string
          final_score?: number | null
          hard_fail?: boolean
          hard_fail_reasons?: Json
          human_approved_at?: string | null
          human_approved_by?: string | null
          id?: string
          notes?: string | null
          penalties?: Json
          raw_score?: number | null
          scope?: string
          shot_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_reviews_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creative_reviews_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          attempts: number
          campaign_id: string | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          mode: string
          payload: Json
          result_asset_id: string | null
          shot_id: string | null
          status: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          mode?: string
          payload?: Json
          result_asset_id?: string | null
          shot_id?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          mode?: string
          payload?: Json
          result_asset_id?: string | null
          shot_id?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_result_asset_id_fkey"
            columns: ["result_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          external_id: string | null
          id: string
          kind: string
          name: string
          secret: string | null
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          external_id?: string | null
          id?: string
          kind: string
          name: string
          secret?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          external_id?: string | null
          id?: string
          kind?: string
          name?: string
          secret?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          phase: string | null
          progress_done: number
          progress_total: number | null
          requested_by: string | null
          result: Json | null
          started_at: string | null
          status: string
          trigger: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind: string
          phase?: string | null
          progress_done?: number
          progress_total?: number | null
          requested_by?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          trigger?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          phase?: string | null
          progress_done?: number
          progress_total?: number | null
          requested_by?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      post_analytics: {
        Row: {
          captured_at: string
          clicks: number
          comments: number
          completion_rate: number | null
          created_at: string
          engagement_rate: number | null
          engagements: number
          followers_gained: number
          id: string
          impressions: number
          leads: number
          likes: number
          link_clicks: number
          measured_on: string
          platform: string | null
          platform_post_id: string | null
          post_id: string
          profile_visits: number
          raw_metrics: Json
          reach: number
          saves: number
          shares: number
          video_views: number
          watch_time_seconds: number
        }
        Insert: {
          captured_at?: string
          clicks?: number
          comments?: number
          completion_rate?: number | null
          created_at?: string
          engagement_rate?: number | null
          engagements?: number
          followers_gained?: number
          id?: string
          impressions?: number
          leads?: number
          likes?: number
          link_clicks?: number
          measured_on?: string
          platform?: string | null
          platform_post_id?: string | null
          post_id: string
          profile_visits?: number
          raw_metrics?: Json
          reach?: number
          saves?: number
          shares?: number
          video_views?: number
          watch_time_seconds?: number
        }
        Update: {
          captured_at?: string
          clicks?: number
          comments?: number
          completion_rate?: number | null
          created_at?: string
          engagement_rate?: number | null
          engagements?: number
          followers_gained?: number
          id?: string
          impressions?: number
          leads?: number
          likes?: number
          link_clicks?: number
          measured_on?: string
          platform?: string | null
          platform_post_id?: string | null
          post_id?: string
          profile_visits?: number
          raw_metrics?: Json
          reach?: number
          saves?: number
          shares?: number
          video_views?: number
          watch_time_seconds?: number
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
          account_id: string | null
          accuracy_report: Json | null
          ai_approved: boolean
          ai_approved_at: string | null
          ai_recommendation: string | null
          body_ar: string | null
          body_en: string | null
          campaign_id: string | null
          created_at: string
          creative_asset_id: string | null
          hard_fail: boolean
          hashtags: string[]
          human_approved_at: string | null
          human_approved_by: string | null
          id: string
          idea_id: string | null
          image_prompt: string | null
          image_url: string | null
          is_test: boolean
          last_publish_attempt_at: string | null
          last_reconciled_at: string | null
          media_type: string
          penalties: Json
          platform: string
          platform_post_id: string | null
          publish_attempts: number
          publish_error: string | null
          publish_idempotency_key: string | null
          published_at: string | null
          published_url: string | null
          raw_score: number | null
          reconcile_attempts: number
          review_breakdown: Json | null
          review_notes: string | null
          review_score: number | null
          scheduled_at: string | null
          score_band: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          accuracy_report?: Json | null
          ai_approved?: boolean
          ai_approved_at?: string | null
          ai_recommendation?: string | null
          body_ar?: string | null
          body_en?: string | null
          campaign_id?: string | null
          created_at?: string
          creative_asset_id?: string | null
          hard_fail?: boolean
          hashtags?: string[]
          human_approved_at?: string | null
          human_approved_by?: string | null
          id?: string
          idea_id?: string | null
          image_prompt?: string | null
          image_url?: string | null
          is_test?: boolean
          last_publish_attempt_at?: string | null
          last_reconciled_at?: string | null
          media_type?: string
          penalties?: Json
          platform: string
          platform_post_id?: string | null
          publish_attempts?: number
          publish_error?: string | null
          publish_idempotency_key?: string | null
          published_at?: string | null
          published_url?: string | null
          raw_score?: number | null
          reconcile_attempts?: number
          review_breakdown?: Json | null
          review_notes?: string | null
          review_score?: number | null
          scheduled_at?: string | null
          score_band?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          accuracy_report?: Json | null
          ai_approved?: boolean
          ai_approved_at?: string | null
          ai_recommendation?: string | null
          body_ar?: string | null
          body_en?: string | null
          campaign_id?: string | null
          created_at?: string
          creative_asset_id?: string | null
          hard_fail?: boolean
          hashtags?: string[]
          human_approved_at?: string | null
          human_approved_by?: string | null
          id?: string
          idea_id?: string | null
          image_prompt?: string | null
          image_url?: string | null
          is_test?: boolean
          last_publish_attempt_at?: string | null
          last_reconciled_at?: string | null
          media_type?: string
          penalties?: Json
          platform?: string
          platform_post_id?: string | null
          publish_attempts?: number
          publish_error?: string | null
          publish_idempotency_key?: string | null
          published_at?: string | null
          published_url?: string | null
          raw_score?: number | null
          reconcile_attempts?: number
          review_breakdown?: Json | null
          review_notes?: string | null
          review_score?: number | null
          scheduled_at?: string | null
          score_band?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_creative_asset_id_fkey"
            columns: ["creative_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
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
          angle: string | null
          approved_for_ai: boolean
          background: string | null
          created_at: string
          finish: string | null
          id: string
          image_type: string | null
          image_url: string
          is_primary: boolean
          product_id: string
          storage_path: string | null
          verified: boolean
          visual_notes: string | null
        }
        Insert: {
          alt_text?: string | null
          angle?: string | null
          approved_for_ai?: boolean
          background?: string | null
          created_at?: string
          finish?: string | null
          id?: string
          image_type?: string | null
          image_url: string
          is_primary?: boolean
          product_id: string
          storage_path?: string | null
          verified?: boolean
          visual_notes?: string | null
        }
        Update: {
          alt_text?: string | null
          angle?: string | null
          approved_for_ai?: boolean
          background?: string | null
          created_at?: string
          finish?: string | null
          id?: string
          image_type?: string | null
          image_url?: string
          is_primary?: boolean
          product_id?: string
          storage_path?: string | null
          verified?: boolean
          visual_notes?: string | null
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
          approved_claims: string[]
          availability: string | null
          category_id: string | null
          content_fingerprint: string | null
          created_at: string
          currency: string | null
          description: string | null
          description_ar: string | null
          dimensions: string | null
          features: string[]
          finishes: string[]
          forbidden_claims: string[]
          id: string
          images: Json
          installation_type: string | null
          is_active: boolean
          last_verified_at: string | null
          materials: string | null
          name: string
          name_ar: string | null
          official_name: string | null
          price_egp: number | null
          product_url: string | null
          sku: string | null
          source_id: string | null
          source_slug: string | null
          source_url: string | null
          synced_at: string | null
          technical_specs: Json
          updated_at: string
          variants: Json
          verification_status: string
        }
        Insert: {
          approved_claims?: string[]
          availability?: string | null
          category_id?: string | null
          content_fingerprint?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          description_ar?: string | null
          dimensions?: string | null
          features?: string[]
          finishes?: string[]
          forbidden_claims?: string[]
          id?: string
          images?: Json
          installation_type?: string | null
          is_active?: boolean
          last_verified_at?: string | null
          materials?: string | null
          name: string
          name_ar?: string | null
          official_name?: string | null
          price_egp?: number | null
          product_url?: string | null
          sku?: string | null
          source_id?: string | null
          source_slug?: string | null
          source_url?: string | null
          synced_at?: string | null
          technical_specs?: Json
          updated_at?: string
          variants?: Json
          verification_status?: string
        }
        Update: {
          approved_claims?: string[]
          availability?: string | null
          category_id?: string | null
          content_fingerprint?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          description_ar?: string | null
          dimensions?: string | null
          features?: string[]
          finishes?: string[]
          forbidden_claims?: string[]
          id?: string
          images?: Json
          installation_type?: string | null
          is_active?: boolean
          last_verified_at?: string | null
          materials?: string | null
          name?: string
          name_ar?: string | null
          official_name?: string | null
          price_egp?: number | null
          product_url?: string | null
          sku?: string | null
          source_id?: string | null
          source_slug?: string | null
          source_url?: string | null
          synced_at?: string | null
          technical_specs?: Json
          updated_at?: string
          variants?: Json
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "catalog_sources"
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
          approved_claims: string[]
          architect: string | null
          collections: string[]
          country: string | null
          created_at: string
          description: string | null
          developer: string | null
          finishes: string[]
          id: string
          image_url: string | null
          location: string | null
          name: string
          products_used: string[]
          project_type: string | null
          source_tier: number
          source_url: string | null
          updated_at: string
          verification_status: string
          verified_facts: string[]
        }
        Insert: {
          approved_claims?: string[]
          architect?: string | null
          collections?: string[]
          country?: string | null
          created_at?: string
          description?: string | null
          developer?: string | null
          finishes?: string[]
          id?: string
          image_url?: string | null
          location?: string | null
          name: string
          products_used?: string[]
          project_type?: string | null
          source_tier?: number
          source_url?: string | null
          updated_at?: string
          verification_status?: string
          verified_facts?: string[]
        }
        Update: {
          approved_claims?: string[]
          architect?: string | null
          collections?: string[]
          country?: string | null
          created_at?: string
          description?: string | null
          developer?: string | null
          finishes?: string[]
          id?: string
          image_url?: string | null
          location?: string | null
          name?: string
          products_used?: string[]
          project_type?: string | null
          source_tier?: number
          source_url?: string | null
          updated_at?: string
          verification_status?: string
          verified_facts?: string[]
        }
        Relationships: []
      }
      shots: {
        Row: {
          ai_artifact_score: number | null
          audio_note: string | null
          camera: string | null
          created_at: string
          duration_seconds: number
          environment: string | null
          id: string
          image_asset_id: string | null
          lens: string | null
          lighting: string | null
          movement: string | null
          product_id: string | null
          product_reference_image: string | null
          prompt: string
          shot_number: number
          start_second: number
          status: string
          storyboard_id: string
          transition: string | null
          updated_at: string
          video_asset_id: string | null
          visual: string
          workflow: string
        }
        Insert: {
          ai_artifact_score?: number | null
          audio_note?: string | null
          camera?: string | null
          created_at?: string
          duration_seconds?: number
          environment?: string | null
          id?: string
          image_asset_id?: string | null
          lens?: string | null
          lighting?: string | null
          movement?: string | null
          product_id?: string | null
          product_reference_image?: string | null
          prompt: string
          shot_number?: number
          start_second?: number
          status?: string
          storyboard_id: string
          transition?: string | null
          updated_at?: string
          video_asset_id?: string | null
          visual: string
          workflow?: string
        }
        Update: {
          ai_artifact_score?: number | null
          audio_note?: string | null
          camera?: string | null
          created_at?: string
          duration_seconds?: number
          environment?: string | null
          id?: string
          image_asset_id?: string | null
          lens?: string | null
          lighting?: string | null
          movement?: string | null
          product_id?: string | null
          product_reference_image?: string | null
          prompt?: string
          shot_number?: number
          start_second?: number
          status?: string
          storyboard_id?: string
          transition?: string | null
          updated_at?: string
          video_asset_id?: string | null
          visual?: string
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "shots_image_asset_fkey"
            columns: ["image_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_product_reference_image_fkey"
            columns: ["product_reference_image"]
            isOneToOne: false
            referencedRelation: "product_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_storyboard_id_fkey"
            columns: ["storyboard_id"]
            isOneToOne: false
            referencedRelation: "storyboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_video_asset_fkey"
            columns: ["video_asset_id"]
            isOneToOne: false
            referencedRelation: "creative_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token: string | null
          account_name: string
          account_type: string
          created_at: string
          external_account_id: string
          id: string
          metadata: Json
          platform: string
          refresh_token: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_name: string
          account_type?: string
          created_at?: string
          external_account_id: string
          id?: string
          metadata?: Json
          platform: string
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_name?: string
          account_type?: string
          created_at?: string
          external_account_id?: string
          id?: string
          metadata?: Json
          platform?: string
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      storyboards: {
        Row: {
          campaign_id: string
          concept_id: string | null
          created_at: string
          edl: Json
          id: string
          status: string
          total_seconds: number
          updated_at: string
        }
        Insert: {
          campaign_id: string
          concept_id?: string | null
          created_at?: string
          edl?: Json
          id?: string
          status?: string
          total_seconds?: number
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          concept_id?: string | null
          created_at?: string
          edl?: Json
          id?: string
          status?: string
          total_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "storyboards_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboards_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "creative_concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      test_runs: {
        Row: {
          accuracy_passed: boolean | null
          band: string | null
          batch_id: string | null
          checks: Json
          created_at: string
          created_by: string | null
          duration_ms: number | null
          error: string | null
          final_score: number | null
          hard_fail: boolean
          hard_fail_reasons: Json
          id: string
          idea_id: string | null
          passed: boolean
          penalties: Json
          raw_score: number | null
          revisions: number
          scenario_id: string | null
          scenario_key: string
          similarity_score: number | null
          suite: string
          unverified_count: number
        }
        Insert: {
          accuracy_passed?: boolean | null
          band?: string | null
          batch_id?: string | null
          checks?: Json
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          final_score?: number | null
          hard_fail?: boolean
          hard_fail_reasons?: Json
          id?: string
          idea_id?: string | null
          passed?: boolean
          penalties?: Json
          raw_score?: number | null
          revisions?: number
          scenario_id?: string | null
          scenario_key: string
          similarity_score?: number | null
          suite?: string
          unverified_count?: number
        }
        Update: {
          accuracy_passed?: boolean | null
          band?: string | null
          batch_id?: string | null
          checks?: Json
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          error?: string | null
          final_score?: number | null
          hard_fail?: boolean
          hard_fail_reasons?: Json
          id?: string
          idea_id?: string | null
          passed?: boolean
          penalties?: Json
          raw_score?: number | null
          revisions?: number
          scenario_id?: string | null
          scenario_key?: string
          similarity_score?: number | null
          suite?: string
          unverified_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "test_runs_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "content_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "test_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      test_scenarios: {
        Row: {
          brief: Json
          created_at: string
          description: string | null
          expected: Json
          id: string
          is_active: boolean
          key: string
          name: string
          sort_order: number
          suite: string
        }
        Insert: {
          brief?: Json
          created_at?: string
          description?: string | null
          expected?: Json
          id?: string
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
          suite?: string
        }
        Update: {
          brief?: Json
          created_at?: string
          description?: string | null
          expected?: Json
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
          suite?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reap_dead_jobs: { Args: { stale_after?: string }; Returns: number }
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
