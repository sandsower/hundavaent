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
          requested_trusted_window_seconds: number
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
          flag_id: string
          status: string
          submitted_at: string
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
      get_member_provider_policy: {
        Args: never
        Returns: {
          policy_version: string
          provider: string
        }[]
      }
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
          evidence: Json
          explanation: string
          flag_id: string
          is_safety_concern: boolean
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
          category: string
          description_en: string
          description_is: string
          evidence_records: Json
          geometry_precision: string
          geometry_source: string
          latitude: number
          lifecycle: string
          locality: string
          longitude: number
          municipality: string
          name_en: string
          name_is: string
          operator_name: string
          place_id: string
          postal_code: string
          version: number
        }[]
      }
      get_moderation_place_suggestion: {
        Args: { requested_suggestion_id: string }
        Returns: {
          address_line: string
          category: string
          contribution_id: string
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
      get_my_achievements: {
        Args: never
        Returns: {
          achievement_group: string
          achievement_key: string
          description_en: string
          description_is: string
          display_order: number
          earned_at: string
          enabled: boolean
          is_new: boolean
          name_en: string
          name_is: string
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
          clarity_score: number
          comfort_score: number
          excluded: boolean
          id: string
          linked_report_id: string
          place_id: string
          private_note: string
          private_note_classification: string
          private_note_updated_at: string
          rated_at: string
          thoughtfulness_score: number
          welcome_score: number
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
      get_public_place_status: {
        Args: { requested_locale: string; requested_place_id: string }
        Returns: {
          name: string
          place_id: string
          public_status: string
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
      list_member_contributor_priority: {
        Args: { requested_member_ids: string[] }
        Returns: {
          member_id: string
          status: string
        }[]
      }
      list_moderation_candidate_places: {
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
          private_note: string
          private_note_classification: string
          private_note_updated_at: string
          rated_at: string
          thoughtfulness_score: number
          welcome_score: number
        }[]
      }
      list_moderation_place_flags: {
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
      list_moderation_place_suggestions: {
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
      list_moderation_queue_summary: {
        Args: never
        Returns: {
          actionable_count: number
          queue_id: string
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
          already_checked_in: boolean
          check_in_id: string
          checked_in_at: string
          place_id: string
          proximity_confirmed: string
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
      retire_place_media: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          media_id: string
          retired_at: string
        }[]
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
          changed_at: string
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
          clarity_score: number
          comfort_score: number
          excluded: boolean
          id: string
          linked_report_id: string
          place_id: string
          private_note: string
          private_note_classification: string
          private_note_updated_at: string
          rated_at: string
          thoughtfulness_score: number
          welcome_score: number
        }[]
      }
      submit_place_correction: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          flag_id: string
          status: string
          submitted_at: string
        }[]
      }
      submit_place_report: {
        Args: { command_payload: Json; command_request_id: string }
        Returns: {
          flag_id: string
          status: string
          submitted_at: string
        }[]
      }
      submit_place_suggestion: {
        Args: { command_proposal: Json; command_request_id: string }
        Returns: {
          status: string
          submitted_at: string
          suggestion_id: string
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
