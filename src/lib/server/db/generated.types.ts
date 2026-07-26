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
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_current_member: {
        Args: { activation_proof: string; activation_request_id: string }
        Returns: string
      }
      apply_pending_member_rating: {
        Args: { requested_place_id: string }
        Returns: {
          activated_current_week: boolean
          applied: boolean
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          overall_score: number | null
          qualifying_action_recorded: boolean
        }[]
      }
      approve_place_media: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          approval_state: string
          approved_at: string
          media_id: string
        }[]
      }
      begin_current_account_deletion: {
        Args: {
          command_disclosure_version: string
          command_locale: string
          command_request_id: string
        }
        Returns: {
          deletion_request_id: string
          deletion_status: string
          requested_at: string
        }[]
      }
      claim_my_achievement_celebrations: {
        Args: never
        Returns: {
          achievement_group: string
          achievement_key: string
          collection: string
          collection_name_en: string
          collection_name_is: string
          description_en: string
          description_is: string
          display_order: number
          earned_at: string
          name_en: string
          name_is: string
          progress_kind: string
          progress_target: number
          tier: string
        }[]
      }
      claim_my_achievement_continuations: {
        Args: never
        Returns: {
          collection: string
          milestone: number
          reached_at: string
        }[]
      }
      clear_member_conduct_flag: {
        Args: {
          command_request_id: string
          reason: string
          requested_flag_id: string
        }
        Returns: {
          cleared_at: string
          flag_id: string
        }[]
      }
      complete_auth_pending_intent: {
        Args: { command_request_id: string; pending_token: string }
        Returns: {
          action: string
          activated_current_week: boolean
          completion_status: string
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          first_time_for_place: boolean
          overall_rating: number | null
          place_id: string
        }[]
      }
      configure_achievement_policy: {
        Args: {
          requested_credit_spacing_minutes: number
          requested_enabled: boolean
          requested_policy_version: string
        }
        Returns: undefined
      }
      configure_check_in_policy: {
        Args: {
          requested_policy_version: string
          requested_proximity_assist_enabled: boolean
        }
        Returns: undefined
      }
      configure_contributor_status_policy: {
        Args: {
          requested_enabled: boolean
          requested_policy_version: string
          requested_trusted_maximum_revoked_in_window: number
          requested_trusted_minimum_distinct_months: number
          requested_trusted_minimum_distinct_subjects: number
          requested_trusted_minimum_net_accepted: number
          requested_trusted_window_months: number
        }
        Returns: undefined
      }
      configure_dog_friendliness_summary_policy: {
        Args: {
          requested_enabled: boolean
          requested_minimum_eligible_count: number
          requested_policy_version: string
          requested_recency_window_seconds: number
        }
        Returns: undefined
      }
      configure_interface_translation_capability: {
        Args: { command_secret: string }
        Returns: undefined
      }
      configure_member_activation_capability: {
        Args: { command_secret: string }
        Returns: undefined
      }
      configure_place_flag_abuse_policy: {
        Args: {
          requested_enabled: boolean
          requested_maximum_open: number
          requested_maximum_submissions: number
          requested_merge_window_seconds: number
          requested_policy_version: string
          requested_submission_window_seconds: number
        }
        Returns: undefined
      }
      configure_private_rating_note_policy: {
        Args: {
          requested_enabled: boolean
          requested_low_score_threshold: number
          requested_policy_version: string
        }
        Returns: undefined
      }
      configure_suggestion_abuse_policy: {
        Args: {
          requested_enabled: boolean
          requested_maximum_submissions: number
          requested_policy_version: string
          requested_submission_window_seconds: number
        }
        Returns: undefined
      }
      confirm_place_flag_contribution: {
        Args: { command_request_id: string; requested_flag_id: string }
        Returns: {
          confirmed_at: string
          contribution_id: string
        }[]
      }
      confirm_suggestion_contribution: {
        Args: { command_request_id: string; requested_suggestion_id: string }
        Returns: {
          confirmed_at: string
          contribution_id: string
        }[]
      }
      create_auth_pending_intent: {
        Args: {
          creation_proof: string
          creation_request_id: string
          creation_subject: string
          requested_action: string
          requested_overall_rating: number | null
          requested_place_id: string
        }
        Returns: string
      }
      create_candidate_place: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          place_id: string
          version: number
        }[]
      }
      create_report_from_rating_note: {
        Args: { command_request_id: string; requested_place_id: string }
        Returns: {
          activated_current_week: boolean
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          flag_id: string
          qualifying_action_recorded: boolean
          status: string
          submitted_at: string
        }[]
      }
      decide_candidate_place: {
        Args: {
          command_request_id: string
          contributor_explanation_en: string
          contributor_explanation_is: string
          expected_draft_version: number
          expected_item_version: number
          requested_outcome: string
          requested_place_id: string
          requested_private_note: string
          requested_reason_code: string
        }
        Returns: {
          draft_version: number
          item_version: number
          place_id: string
          status: string
        }[]
      }
      exclude_dog_friendliness_rating: {
        Args: {
          command_request_id: string
          exclusion_kind: string
          reason: string
          requested_member_id: string
          requested_place_id: string
        }
        Returns: {
          excluded_at: string
          id: string
        }[]
      }
      get_achievement_feature_status: {
        Args: never
        Returns: {
          enabled: boolean
        }[]
      }
      get_auth_pending_intent: {
        Args: { pending_token: string; requested_locale: string }
        Returns: {
          action: string
          overall_rating: number | null
          place_id: string
          place_name: string
        }[]
      }
      get_check_in_policy: {
        Args: never
        Returns: {
          proximity_assist_enabled: boolean
        }[]
      }
      get_current_check_in_status: {
        Args: { requested_place_id: string }
        Returns: {
          checked_in_at: string
          has_recent_check_in: boolean
          proximity_confirmed: string
        }[]
      }
      get_current_member_account: {
        Args: never
        Returns: {
          created_at: string
          deletion_requested_at: string
          deletion_status: string
          member_id: string
        }[]
      }
      get_current_member_roundup_preferences: {
        Args: never
        Returns: {
          categories: string[]
          configured: boolean
          email_interest: boolean
          email_interest_changed_at: string
          municipalities: string[]
          roundup_locale: string
          updated_at: string
        }[]
      }
      get_current_member_weekly_rhythm: {
        Args: never
        Returns: {
          active: boolean
          ends_on: string
          starts_on: string
        }[]
      }
      get_current_member_weekly_roundup: {
        Args: never
        Returns: {
          category: string
          changed_at: string
          configured: boolean
          municipality: string
          place_id: string
          place_name: string
          recommendation_rank: number
          recommendation_reason: string
          roundup_locale: string
          week_ends_on: string
          week_starts_on: string
        }[]
      }
      get_current_user_roles: { Args: never; Returns: string[] }
      get_dog_friendliness_summary: {
        Args: { requested_place_id: string }
        Returns: {
          dimensions: Json
          eligible_count: number
          overall_mean: number
          overall_visible: boolean
          place_id: string
          summary_visible: boolean
          trailing_twelve_month_count: number
        }[]
      }
      get_interface_translation_revision: {
        Args: {
          command_issued_at: number
          command_proof: string
          command_request_id: string
          requested_revision_number: number
        }
        Returns: Json
      }
      get_interface_translation_workspace: {
        Args: {
          command_issued_at: number
          command_proof: string
          command_request_id: string
        }
        Returns: Json
      }
      get_member_provider_policy: {
        Args: never
        Returns: {
          automatic_linking_verified_email: boolean
          email_enabled: boolean
          facebook_enabled: boolean
          policy_version: string
        }[]
      }
      get_member_retention_report: { Args: never; Returns: Json }
      get_moderation_contributor_status: {
        Args: { requested_member_id: string }
        Returns: {
          distinct_months_in_window: number
          distinct_subjects_in_window: number
          first_net_accepted_at: string
          has_active_flag: boolean
          net_accepted_in_window: number
          net_accepted_total: number
          policy_version: string
          revoked_in_window: number
          status: string
        }[]
      }
      get_moderation_member_achievements: {
        Args: { requested_member_id: string }
        Returns: {
          achievement_key: string
          definition_version: number
          earned_at: string
          notified_at: string
          recalculation_evaluated_at: string
          recalculation_reason: string
          recalculation_triggering_event: string
        }[]
      }
      get_moderation_place_by_lead_id: {
        Args: { requested_lead_id: string }
        Returns: string
      }
      get_moderation_place_flag: {
        Args: { requested_flag_id: string }
        Returns: {
          access_condition_id: string
          applied_access_condition_id: string
          contribution_id: string
          current_live_value: Json
          current_place_version: number
          current_value_snapshot: Json
          current_verification_evidence: Json
          current_verification_freshness_until: string
          current_verification_id: string
          current_verification_status: string
          current_verification_verified_at: string
          dispute_id: string
          draft_payload: Json
          draft_updated_at: string
          draft_updated_by: string
          draft_version: number
          evidence: Json
          explanation: string
          flag_id: string
          is_safety_concern: boolean
          item_version: number
          kind: string
          member_id: string
          place_id: string
          place_name_en: string
          place_name_is: string
          private_note: string
          proposed_value: Json
          report_reason: string
          status: string
          submitted_at: string
          successor_place_id: string
          target_field: string
          target_kind: string
          transition_id: string
          updated_at: string
        }[]
      }
      get_moderation_place_media: {
        Args: { requested_place_id: string }
        Returns: {
          alt_text_en: string
          alt_text_is: string
          approval_state: string
          approved_at: string
          approved_by: string
          attribution_text: string
          attribution_url: string
          byte_size: number
          captured_at: string
          captured_by: string
          content_sha256: string
          height_px: number
          is_primary: boolean
          kind: string
          license_reference: string
          license_url: string
          media_id: string
          mime_type: string
          people_review: string
          photographer_or_uploader: string
          retired_at: string
          retired_by: string
          rights_basis: string
          rights_evidence_reference: string
          source_or_capture_date: string
          source_url: string
          storage_bucket: string
          storage_object_path: string
          uploaded_at: string
          uploaded_by: string
          width_px: number
        }[]
      }
      get_moderation_place_review: {
        Args: { requested_place_id: string }
        Returns: {
          access_conditions: Json
          address_line: string
          candidate_status: string
          category: string
          contributor_id: string
          description_en: string
          description_is: string
          dog_amenities: Json
          draft_payload: Json
          draft_updated_at: string
          draft_updated_by: string
          draft_version: number
          evidence_records: Json
          geometry_precision: string
          geometry_source: string
          item_version: number
          latitude: number
          lifecycle: string
          locality: string
          longitude: number
          municipality: string
          name_en: string
          name_is: string
          opening_hours: Json
          operator_name: string
          originating_suggestion_id: string
          phone: string
          place_id: string
          postal_code: string
          readiness_issues: Json
          readiness_state: string
          version: number
          website_url: string
        }[]
      }
      get_moderation_place_review_v2: {
        Args: { requested_place_id: string }
        Returns: {
          access_conditions: Json
          address_line: string
          candidate_status: string
          category: string
          contributor_id: string
          description_en: string
          description_is: string
          dog_amenities: Json
          draft_payload: Json
          draft_updated_at: string
          draft_updated_by: string
          draft_version: number
          evidence_records: Json
          geometry_precision: string
          geometry_source: string
          item_version: number
          latitude: number
          lifecycle: string
          locality: string
          longitude: number
          municipality: string
          name_en: string
          name_is: string
          opening_hours: Json
          operator_name: string
          originating_suggestion_id: string
          phone: string
          place_id: string
          postal_code: string
          readiness_issues: Json
          readiness_state: string
          version: number
          website_url: string
          wheelchair_accessibility: string
        }[]
      }
      get_moderation_place_suggestion: {
        Args: { requested_suggestion_id: string }
        Returns: {
          address_line: string
          category: string
          contribution_id: string
          draft_payload: Json
          draft_updated_at: string
          draft_updated_by: string
          draft_version: number
          item_version: number
          locality: string
          location_identity_place_id: string
          member_id: string
          name_en: string
          name_is: string
          operator_identity_place_id: string
          operator_name: string
          private_note: string
          proposal: Json
          reviewed_proposal: Json
          status: string
          submitted_at: string
          suggestion_id: string
          updated_at: string
        }[]
      }
      get_moderation_trusted_verification_context: {
        Args: { requested_flag_id: string }
        Returns: {
          outcome: string
          submission_id: string
          superseded_by_submission_id: string
          task_id: string
          task_kind: string
        }[]
      }
      get_my_achievement_collection_progress: {
        Args: never
        Returns: {
          collection: string
          current_value: number
          next_milestone: number | null
          progress_kind: string
          total_value: number | null
        }[]
      }
      get_my_achievement_status: {
        Args: never
        Returns: {
          enabled: boolean
          has_unread: boolean
        }[]
      }
      get_my_achievements: {
        Args: never
        Returns: {
          achievement_group: string
          achievement_key: string
          collection: string
          collection_description_en: string
          collection_description_is: string
          collection_name_en: string
          collection_name_is: string
          description_en: string
          description_is: string
          display_order: number
          earned_at: string
          enabled: boolean
          entry_kind: string
          is_new: boolean
          name_en: string
          name_is: string
          progress_current: number
          progress_kind: string
          progress_target: number
          tier: string
        }[]
      }
      get_my_contributor_status: {
        Args: never
        Returns: {
          policy_version: string
          status: string
          status_since: string
        }[]
      }
      get_my_dog_friendliness_rating: {
        Args: { requested_place_id: string }
        Returns: {
          clarity_score: number | null
          comfort_score: number | null
          id: string
          overall_score: number
          place_id: string
          private_note: string | null
          private_note_updated_at: string | null
          rated_at: string
          thoughtfulness_score: number | null
          welcome_score: number | null
        }[]
      }
      get_my_impact_record: {
        Args: { requested_locale: string }
        Returns: {
          active_months: number
          active_weeks: number
          confirmed_contributions: number
          credited_category_groups: number
          credited_municipalities: number
          credited_places: number
          member_since: string
          pending_submissions: number
          recent_outcomes: Json
          rejected_submissions: number
          resolved_without_contribution: number
          revoked_contributions: number
          submissions_total: number
          valid_ratings: number
        }[]
      }
      get_my_trusted_verification_feedback: {
        Args: never
        Returns: {
          has_unread: boolean
          latest_confirmed_at: string
          latest_place_id: string
          latest_task_kind: string
          unread_count: number
        }[]
      }
      get_photo_acquisition_inventory: {
        Args: never
        Returns: {
          existing_photo_hashes: string[]
          existing_photo_source_urls: string[]
          latitude: number
          lifecycle: string
          longitude: number
          name_en: string
          name_is: string
          place_id: string
          website_url: string
        }[]
      }
      get_private_rating_note_policy: {
        Args: never
        Returns: {
          enabled: boolean
          low_score_threshold: number
        }[]
      }
      get_published_interface_translations: {
        Args: { requested_locale: string }
        Returns: {
          messages: Json
          published_at: string
          revision_number: number
        }[]
      }
      get_published_place_profile: {
        Args: { requested_locale: string; requested_place_id: string }
        Returns: {
          access_area: string
          access_area_note: string
          access_condition_id: string
          address_line: string
          availability_window: Json
          category: string
          description: string
          dog_amenities: Json
          dog_eligibility: Json
          evidence_sources: Json
          freshness_until: string
          latitude: number
          locality: string
          longitude: number
          name: string
          opening_hours: Json
          permission_requirement: string
          phone: string
          place_id: string
          postal_code: string
          restraint_condition: string
          restraint_note: string
          verified_at: string
          website_url: string
        }[]
      }
      get_published_place_profile_v2: {
        Args: { requested_locale: string; requested_place_id: string }
        Returns: {
          access_area: string
          access_area_note: string
          access_condition_id: string
          access_information_urls: Json
          address_line: string
          availability_state: string
          availability_window: Json
          category: string
          description: string
          dog_amenities: Json
          dog_eligibility: Json
          latitude: number
          locality: string
          longitude: number
          name: string
          opening_hours: Json
          permission_requirement: string
          phone: string
          place_id: string
          postal_code: string
          restraint_condition: string
          restraint_note: string
          website_url: string
        }[]
      }
      get_published_place_profile_v3: {
        Args: { requested_locale: string; requested_place_id: string }
        Returns: {
          access_area: string
          access_area_note: string
          access_condition_id: string
          access_information_urls: Json
          address_line: string
          availability_state: string
          availability_window: Json
          category: string
          description: string
          dog_amenities: Json
          dog_eligibility: Json
          latitude: number
          locality: string
          longitude: number
          name: string
          opening_hours: Json
          permission_requirement: string
          phone: string
          place_id: string
          postal_code: string
          restraint_condition: string
          restraint_note: string
          website_url: string
          wheelchair_accessibility: string
        }[]
      }
      get_support_check_in: {
        Args: {
          command_request_id: string
          requested_check_in_id: string
          support_reason: string
        }
        Returns: {
          check_in_id: string
          checked_in_at: string
          member_id: string
          place_id: string
          proximity_confirmed: string
        }[]
      }
      get_trusted_verification_task: {
        Args: { requested_locale: string; requested_task_id: string }
        Returns: {
          category: string
          current_value: Json
          freshness_until: string
          municipality: string
          place_id: string
          place_name: string
          task_id: string
          task_kind: string
        }[]
      }
      has_current_user_role: {
        Args: { required_role: string }
        Returns: boolean
      }
      list_current_favourite_ids: {
        Args: never
        Returns: {
          place_id: string
        }[]
      }
      list_current_favourites: {
        Args: {
          requested_before_place_id?: string
          requested_before_saved_at?: string
          requested_limit?: number
          requested_locale: string
        }
        Returns: {
          availability: string
          category: string
          locality: string
          name: string
          place_id: string
          saved_at: string
          successor_available: boolean
          successor_name: string | null
          successor_place_id: string | null
        }[]
      }
      list_current_member_weekly_rhythm: {
        Args: never
        Returns: {
          active: boolean
          current: boolean
          ends_on: string
          starts_on: string
        }[]
      }
      list_member_contributor_priority: {
        Args: { requested_member_ids: string[] }
        Returns: {
          member_id: string
          status: string
        }[]
      }
      list_moderation_candidate_places:
        | {
            Args: {
              cursor_created_at?: string
              cursor_place_id?: string
              requested_limit?: number
            }
            Returns: {
              address_line: string
              category: string
              created_at: string
              locality: string
              municipality: string
              operator_name: string
              place_id: string
            }[]
          }
        | {
            Args: {
              cursor_created_at?: string
              cursor_place_id?: string
              requested_filter: string
              requested_limit?: number
            }
            Returns: {
              address_line: string
              candidate_status: string
              category: string
              created_at: string
              draft_updated_at: string
              draft_updated_by: string
              draft_version: number
              item_version: number
              locality: string
              municipality: string
              operator_name: string
              place_id: string
              readiness_issue_count: number
              readiness_state: string
            }[]
          }
      list_moderation_contributor_evidence: {
        Args: { requested_member_id: string }
        Returns: {
          confirmed_at: string
          contribution_id: string
          flag_active: boolean
          flag_id: string
          flag_kind: string
          flag_reason: string
          flag_recorded_at: string
          revoked_at: string
          revoked_reason: string
          subject_place_id: string
        }[]
      }
      list_moderation_dog_friendliness_rating_note_history: {
        Args: { requested_member_id: string; requested_place_id: string }
        Returns: {
          event_kind: string
          occurred_at: string
          private_note: string
          private_note_classification: string
        }[]
      }
      list_moderation_dog_friendliness_ratings: {
        Args: { requested_place_id: string }
        Returns: {
          clarity_score: number
          comfort_score: number
          excluded_at: string
          excluded_kind: string
          excluded_reason: string
          id: string
          linked_report_id: string
          member_id: string
          overall_score: number
          private_note: string
          private_note_classification: string
          private_note_updated_at: string
          rated_at: string
          thoughtfulness_score: number
          welcome_score: number
        }[]
      }
      list_moderation_place_flags:
        | {
            Args: {
              cursor_flag_id?: string
              cursor_priority?: number
              cursor_submitted_at?: string
              requested_limit?: number
            }
            Returns: {
              access_condition_id: string
              flag_id: string
              is_safety_concern: boolean
              kind: string
              member_id: string
              place_id: string
              place_name_en: string
              place_name_is: string
              priority: number
              report_reason: string
              status: string
              submitted_at: string
              target_field: string
              target_kind: string
              updated_at: string
            }[]
          }
        | {
            Args: {
              cursor_flag_id?: string
              cursor_priority?: number
              cursor_submitted_at?: string
              cursor_trust_priority?: number
              requested_filter: string
              requested_limit?: number
            }
            Returns: {
              access_condition_id: string
              draft_updated_at: string
              draft_updated_by: string
              draft_version: number
              flag_id: string
              is_safety_concern: boolean
              item_version: number
              kind: string
              member_id: string
              place_id: string
              place_name_en: string
              place_name_is: string
              priority: number
              readiness_state: string
              report_reason: string
              status: string
              submitted_at: string
              target_field: string
              target_kind: string
              trust_priority: number
              trust_tier: string
              updated_at: string
            }[]
          }
      list_moderation_place_suggestions:
        | {
            Args: {
              cursor_queue_rank?: number
              cursor_submitted_at?: string
              cursor_suggestion_id?: string
              requested_limit?: number
            }
            Returns: {
              address_line: string
              category: string
              locality: string
              member_id: string
              name_en: string
              name_is: string
              operator_name: string
              queue_rank: number
              status: string
              submitted_at: string
              suggestion_id: string
              updated_at: string
            }[]
          }
        | {
            Args: {
              cursor_queue_rank?: number
              cursor_submitted_at?: string
              cursor_suggestion_id?: string
              cursor_trust_priority?: number
              requested_filter: string
              requested_limit?: number
            }
            Returns: {
              address_line: string
              category: string
              draft_updated_at: string
              draft_updated_by: string
              draft_version: number
              item_version: number
              locality: string
              member_id: string
              name_en: string
              name_is: string
              operator_name: string
              queue_rank: number
              readiness_state: string
              status: string
              submitted_at: string
              suggestion_id: string
              trust_priority: number
              trust_tier: string
              updated_at: string
            }[]
          }
      list_moderation_queue_summary: {
        Args: never
        Returns: {
          actionable_count: number
          deferred_count: number
          queue_id: string
          resolved_count: number
        }[]
      }
      list_moderation_rating_note_dispositions: {
        Args: { requested_member_id: string; requested_place_id: string }
        Returns: {
          disposition_kind: string
          id: string
          moderator_id: string
          notes: string
          occurred_at: string
        }[]
      }
      list_my_open_place_flags: {
        Args: { requested_place_id: string }
        Returns: {
          access_condition_id: string
          kind: string
          report_reason: string
          status: string
          target_field: string
          target_kind: string
        }[]
      }
      list_my_place_flags: {
        Args: {
          cursor_flag_id?: string
          cursor_submitted_at?: string
          requested_limit?: number
        }
        Returns: {
          flag_id: string
          kind: string
          member_reason_en: string
          member_reason_is: string
          place_name_en: string
          place_name_is: string
          report_reason: string
          status: string
          submitted_at: string
          target_field: string
          target_kind: string
          updated_at: string
        }[]
      }
      list_my_place_suggestions: {
        Args: {
          cursor_submitted_at?: string
          cursor_suggestion_id?: string
          requested_limit?: number
        }
        Returns: {
          candidate_place_id: string
          category: string
          duplicate_place_id: string
          locality: string
          member_reason_en: string
          member_reason_is: string
          name_en: string
          name_is: string
          status: string
          submitted_at: string
          suggestion_id: string
          updated_at: string
        }[]
      }
      list_my_trusted_verification_submissions: {
        Args: { requested_limit?: number; requested_locale: string }
        Returns: {
          confirmed_at: string
          flag_id: string
          member_reason: string
          outcome: string
          place_id: string
          place_name: string
          submission_id: string
          submitted_at: string
          task_id: string
          task_kind: string
        }[]
      }
      list_personal_check_ins: {
        Args: {
          requested_before_check_in_id?: string
          requested_before_checked_in_at?: string
          requested_limit?: number
          requested_locale: string
        }
        Returns: {
          availability: string
          category: string
          check_in_id: string
          checked_in_at: string
          latitude: number
          locality: string
          longitude: number
          name: string
          place_id: string
          successor_available: boolean
          successor_name: string
          successor_place_id: string
        }[]
      }
      list_personal_places: {
        Args: {
          requested_before_activity_at?: string
          requested_before_place_id?: string
          requested_filter?: string
          requested_limit?: number
          requested_locale: string
        }
        Returns: {
          availability: string
          category: string
          favourited_at: string
          first_visited_at: string
          is_favourite: boolean
          last_activity_at: string
          last_visited_at: string
          latitude: number
          locality: string
          longitude: number
          name: string
          place_id: string
          successor_available: boolean
          successor_name: string
          successor_place_id: string
          visit_count: number
        }[]
      }
      list_published_place_photos: {
        Args: { requested_place_id: string }
        Returns: {
          alt_text_en: string
          alt_text_is: string
          attribution_text: string
          attribution_url: string
          height_px: number
          is_primary: boolean
          license_reference: string
          license_url: string
          media_id: string
          rights_basis: string
          source_url: string
          storage_bucket: string
          storage_object_path: string
          width_px: number
        }[]
      }
      list_published_place_primary_photos: {
        Args: { requested_place_ids: string[] }
        Returns: {
          alt_text_en: string
          alt_text_is: string
          attribution_text: string
          attribution_url: string
          height_px: number
          license_reference: string
          license_url: string
          media_id: string
          place_id: string
          rights_basis: string
          source_url: string
          storage_bucket: string
          storage_object_path: string
          width_px: number
        }[]
      }
      list_published_places: {
        Args: { requested_locale: string }
        Returns: {
          access_area: string
          access_condition_count: number
          access_conditions: Json
          category: string
          latitude: number
          locality: string
          longitude: number
          name: string
          permission_requirement: string
          place_id: string
          restraint_condition: string
          simple_access_summary: boolean
          verified_at: string
        }[]
      }
      list_published_places_v2: {
        Args: { requested_locale: string }
        Returns: {
          access_area: string
          access_condition_count: number
          access_conditions: Json
          category: string
          latitude: number
          locality: string
          longitude: number
          name: string
          permission_requirement: string
          place_id: string
          restraint_condition: string
          simple_access_summary: boolean
        }[]
      }
      list_published_places_v3: {
        Args: { requested_locale: string }
        Returns: {
          access_area: string
          access_condition_count: number
          access_conditions: Json
          category: string
          latitude: number
          locality: string
          longitude: number
          name: string
          permission_requirement: string
          place_id: string
          restraint_condition: string
          simple_access_summary: boolean
          wheelchair_accessibility: string
        }[]
      }
      list_related_place_flags: {
        Args: { requested_flag_id: string }
        Returns: {
          flag_id: string
          kind: string
          status: string
          submitted_at: string
        }[]
      }
      list_suggestion_place_matches: {
        Args: { requested_suggestion_id: string }
        Returns: {
          address_line: string
          exact_location: boolean
          lifecycle: string
          locality: string
          name_en: string
          name_is: string
          operator_name: string
          place_id: string
          same_operator: boolean
        }[]
      }
      list_suggestion_place_matches_for_payload: {
        Args: { requested_proposal: Json }
        Returns: {
          address_line: string
          exact_location: boolean
          lifecycle: string
          locality: string
          name_en: string
          name_is: string
          operator_name: string
          place_id: string
          same_operator: boolean
        }[]
      }
      list_trusted_verification_tasks: {
        Args: { requested_limit?: number; requested_locale: string }
        Returns: {
          category: string
          current_value: Json
          freshness_until: string
          municipality: string
          place_id: string
          place_name: string
          task_id: string
          task_kind: string
        }[]
      }
      mark_my_trusted_verification_feedback_read: {
        Args: { requested_read_through: string }
        Returns: {
          read_through_confirmed_at: string
        }[]
      }
      open_access_dispute: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          dispute_id: string
          disputed_verification_id: string
          opened_at: string
        }[]
      }
      provision_moderator: {
        Args: { command_user_id: string }
        Returns: string
      }
      publish_interface_translation_drafts: {
        Args: {
          command_issued_at: number
          command_proof: string
          command_request_id: string
          expected_draft_generation: number
          expected_publication_revision: number
        }
        Returns: {
          change_count: number
          published_at: string
          revision_number: number
        }[]
      }
      quarantine_place_pending_geometry: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          lifecycle: string
          place_id: string
          version: number
        }[]
      }
      recalculate_member_achievements: {
        Args: { command_request_id: string; requested_member_id: string }
        Returns: undefined
      }
      recalculate_member_contributor_status: {
        Args: { command_request_id: string; requested_member_id: string }
        Returns: {
          policy_version: string
          status: string
        }[]
      }
      reconfirm_access_condition: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          freshness_until: string
          verification_id: string
          verified_at: string
        }[]
      }
      record_check_in: {
        Args: {
          command_request_id: string
          requested_place_id: string
          requested_proximity_status: string
        }
        Returns: {
          activated_current_week: boolean
          already_checked_in: boolean
          check_in_id: string
          checked_in_at: string
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          place_id: string
          proximity_confirmed: string
          qualifying_action_recorded: boolean
        }[]
      }
      record_member_auth_event: {
        Args: { event_action: string; event_request_id: string }
        Returns: string
      }
      record_member_conduct_flag: {
        Args: {
          command_request_id: string
          flag_kind: string
          reason: string
          related_contribution_id: string
          requested_member_id: string
        }
        Returns: {
          flag_id: string
          recorded_at: string
        }[]
      }
      record_rating_note_disposition: {
        Args: {
          command_request_id: string
          disposition_kind: string
          notes: string
          requested_member_id: string
          requested_place_id: string
        }
        Returns: {
          id: string
          occurred_at: string
        }[]
      }
      register_acquired_place_photo: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          approval_state: string
          kind: string
          media_id: string
          uploaded_at: string
        }[]
      }
      register_place_media: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          approval_state: string
          kind: string
          media_id: string
          uploaded_at: string
        }[]
      }
      reinstate_dog_friendliness_rating: {
        Args: {
          command_request_id: string
          reason: string
          requested_member_id: string
          requested_place_id: string
        }
        Returns: {
          id: string
          reinstated_at: string
        }[]
      }
      reject_place_media: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          approval_state: string
          media_id: string
        }[]
      }
      resolve_access_dispute: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          access_condition_id: string
          dispute_id: string
          resolved_at: string
          verification_id: string
        }[]
      }
      resolve_place_flag: {
        Args: {
          application_payload: Json
          command_request_id: string
          dispute_command: Json
          expected_draft_version: number
          expected_item_version: number
          member_reason_en: string
          member_reason_is: string
          private_note: string
          requested_flag_id: string
          requested_outcome: string
          transition_command: Json
        }
        Returns: {
          applied_access_condition_id: string
          dispute_id: string
          flag_id: string
          status: string
          transition_id: string
        }[]
      }
      resolve_place_suggestion: {
        Args: {
          command_request_id: string
          confirm_useful: boolean
          expected_draft_version: number
          expected_item_version: number
          member_reason_en: string
          member_reason_is: string
          moderator_candidate_payload: Json
          private_note: string
          requested_duplicate_place_id: string
          requested_location_identity_place_id: string
          requested_operator_identity_place_id: string
          requested_outcome: string
          requested_suggestion_id: string
        }
        Returns: {
          candidate_place_id: string
          contribution_id: string
          duplicate_place_id: string
          status: string
          suggestion_id: string
        }[]
      }
      restore_interface_translation_revision: {
        Args: {
          command_issued_at: number
          command_proof: string
          command_request_id: string
          expected_current_revision_number: number
          requested_revision_number: number
        }
        Returns: {
          change_count: number
          published_at: string
          revision_number: number
        }[]
      }
      retire_place_media: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          media_id: string
          retired_at: string
        }[]
      }
      retire_previous_interface_translation_capability: {
        Args: { command_secret: string }
        Returns: undefined
      }
      revoke_contribution: {
        Args: {
          command_request_id: string
          reason: string
          requested_contribution_id: string
        }
        Returns: {
          contribution_id: string
          revoked_at: string
        }[]
      }
      save_candidate_place_moderation_draft: {
        Args: {
          command_request_id: string
          expected_draft_version: number
          expected_item_version: number
          requested_payload: Json
          requested_place_id: string
          requested_section_id: string
        }
        Returns: {
          draft_version: number
          payload: Json
          target_id: string
          updated_at: string
          updated_by: string
        }[]
      }
      save_current_member_roundup_preferences: {
        Args: {
          requested_categories: string[]
          requested_email_interest: boolean
          requested_locale: string
          requested_municipalities: string[]
        }
        Returns: {
          categories: string[]
          configured: boolean
          email_interest: boolean
          email_interest_changed_at: string
          municipalities: string[]
          roundup_locale: string
          updated_at: string
        }[]
      }
      save_inline_dog_friendliness_rating: {
        Args: {
          command_request_id: string
          requested_clarity_score: number | null
          requested_comfort_score: number | null
          requested_overall_score: number
          requested_place_id: string
          requested_private_note?: string | null
          requested_private_note_classification?: string | null
          requested_thoughtfulness_score: number | null
          requested_update_private_note?: boolean
          requested_welcome_score: number | null
        }
        Returns: {
          activated_current_week: boolean
          clarity_score: number | null
          comfort_score: number | null
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          id: string
          overall_score: number
          place_id: string
          private_note: string | null
          private_note_updated_at: string | null
          qualifying_action_recorded: boolean
          rated_at: string
          thoughtfulness_score: number | null
          welcome_score: number | null
        }[]
      }
      save_interface_translation_draft: {
        Args: {
          command_issued_at: number
          command_proof: string
          command_request_id: string
          expected_draft_version: number
          expected_publication_revision: number
          requested_key: string
          requested_locale: string
          requested_value: string
        }
        Returns: {
          draft_version: number
          pending_count: number
        }[]
      }
      save_place_flag_moderation_draft: {
        Args: {
          command_request_id: string
          expected_draft_version: number
          expected_item_version: number
          requested_flag_id: string
          requested_payload: Json
          requested_section_id: string
        }
        Returns: {
          draft_version: number
          payload: Json
          target_id: string
          updated_at: string
          updated_by: string
        }[]
      }
      save_place_suggestion_moderation_draft: {
        Args: {
          command_request_id: string
          expected_draft_version: number
          expected_item_version: number
          requested_payload: Json
          requested_section_id: string
          requested_suggestion_id: string
        }
        Returns: {
          draft_version: number
          payload: Json
          target_id: string
          updated_at: string
          updated_by: string
        }[]
      }
      schedule_reconfirmation_due: {
        Args: { command_request_id: string; requested_as_of: string }
        Returns: {
          due_at: string
          task_id: string
          verification_id: string
        }[]
      }
      set_current_favourite: {
        Args: { desired_state: boolean; requested_place_id: string }
        Returns: {
          activated_current_week: boolean
          changed_at: string
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          first_time_for_place: boolean
          is_favourite: boolean
          place_id: string
        }[]
      }
      submit_dog_friendliness_rating: {
        Args: {
          command_request_id: string
          requested_clarity_score: number
          requested_comfort_score: number
          requested_place_id: string
          requested_private_note?: string
          requested_private_note_classification?: string
          requested_thoughtfulness_score: number
          requested_update_private_note?: boolean
          requested_welcome_score: number
        }
        Returns: {
          activated_current_week: boolean
          clarity_score: number | null
          comfort_score: number | null
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          id: string
          place_id: string
          private_note: string | null
          private_note_updated_at: string | null
          qualifying_action_recorded: boolean
          rated_at: string
          thoughtfulness_score: number | null
          welcome_score: number | null
        }[]
      }
      submit_place_correction: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          activated_current_week: boolean
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          flag_id: string
          qualifying_action_recorded: boolean
          status: string
          submitted_at: string
        }[]
      }
      submit_place_report: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          activated_current_week: boolean
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          flag_id: string
          qualifying_action_recorded: boolean
          status: string
          submitted_at: string
        }[]
      }
      submit_place_suggestion: {
        Args: { command_proposal: Json; command_request_id: string }
        Returns: {
          activated_current_week: boolean
          current_week_active: boolean
          current_week_ends_on: string
          current_week_starts_on: string
          qualifying_action_recorded: boolean
          status: string
          submitted_at: string
          suggestion_id: string
        }[]
      }
      submit_trusted_verification_task: {
        Args: {
          command_request_id: string
          requested_evidence: Json
          requested_explanation: string
          requested_response: Json
          requested_task_id: string
        }
        Returns: {
          activated_current_week: boolean
          flag_id: string
          outcome: string
          submission_id: string
          submitted_at: string
        }[]
      }
      sync_interface_translation_inventory: {
        Args: { command_request_id: string; requested_catalogues: Json }
        Returns: {
          change_count: number
          published_at: string
          revision_number: number
        }[]
      }
      transition_place_identity: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          predecessor_place_id: string
          predecessor_version: number
          successor_place_id: string
          transition_id: string
          transition_kind: string
        }[]
      }
      update_candidate_place_location: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          geometry_precision: string
          place_id: string
          version: number
        }[]
      }
      update_moderated_place_location: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          geometry_precision: string
          place_id: string
          version: number
        }[]
      }
      update_place_wheelchair_accessibility: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          place_id: string
          version: number
          wheelchair_accessibility: string
        }[]
      }
      verify_and_publish_place: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          place_id: string
          published_at: string
          verification_ids: string[]
          version: number
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
