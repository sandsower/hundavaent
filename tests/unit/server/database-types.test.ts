import { describe, expectTypeOf, it } from 'vitest';

import type { Database, Json } from '$server/db/generated.types';

type PublicFunctions = Database['public']['Functions'];
type ListPublishedPlace = PublicFunctions['list_published_places']['Returns'][number];
type PublishedPlaceProfile = PublicFunctions['get_published_place_profile']['Returns'][number];

describe('generated public database types', () => {
  it('types the reviewed list projection', () => {
    expectTypeOf<keyof ListPublishedPlace>().toEqualTypeOf<
      | 'access_area'
      | 'access_conditions'
      | 'access_condition_count'
      | 'category'
      | 'latitude'
      | 'locality'
      | 'longitude'
      | 'name'
      | 'permission_requirement'
      | 'place_id'
      | 'restraint_condition'
      | 'simple_access_summary'
    >();
    expectTypeOf<ListPublishedPlace>().toHaveProperty('place_id').toEqualTypeOf<string>();
    expectTypeOf<ListPublishedPlace>().toHaveProperty('name').toEqualTypeOf<string>();
  });

  it('types the reviewed profile projection', () => {
    expectTypeOf<PublicFunctions['get_published_place_profile']['Args']>().toEqualTypeOf<{
      requested_locale: string;
      requested_place_id: string;
    }>();
    expectTypeOf<PublishedPlaceProfile>()
      .toHaveProperty('access_condition_id')
      .toEqualTypeOf<string>();
    expectTypeOf<PublishedPlaceProfile>()
      .toHaveProperty('access_information_urls')
      .toEqualTypeOf<Json>();
    expectTypeOf<PublishedPlaceProfile>()
      .toHaveProperty('availability_state')
      .toEqualTypeOf<string>();
    expectTypeOf<PublishedPlaceProfile>().toHaveProperty('opening_hours').toEqualTypeOf<Json>();
  });

  it('contains no caller-visible table types', () => {
    expectTypeOf<keyof Database['public']['Tables']>().toEqualTypeOf<never>();
  });

  it('types the Candidate creation command without exposing private tables', () => {
    expectTypeOf<PublicFunctions['create_candidate_place']['Args']>().toEqualTypeOf<{
      command_payload: Json;
      command_request_id: string;
    }>();
    expectTypeOf<PublicFunctions['create_candidate_place']['Returns'][number]>().toEqualTypeOf<{
      place_id: string;
      version: number;
    }>();
  });

  it('types caller-scoped Member account commands without provider profile fields', () => {
    type MemberAccount = PublicFunctions['get_current_member_account']['Returns'][number];

    expectTypeOf<keyof MemberAccount>().toEqualTypeOf<
      'member_id' | 'created_at' | 'deletion_status' | 'deletion_requested_at'
    >();
    expectTypeOf<PublicFunctions['begin_current_account_deletion']['Args']>().toEqualTypeOf<{
      command_request_id: string;
      command_locale: string;
      command_disclosure_version: string;
    }>();
    expectTypeOf<PublicFunctions['activate_current_member']['Args']>().toEqualTypeOf<{
      activation_proof: string;
      activation_request_id: string;
    }>();
    expectTypeOf<PublicFunctions['activate_current_member']['Returns']>().toEqualTypeOf<string>();
    expectTypeOf<PublicFunctions['provision_moderator']['Args']>().toEqualTypeOf<{
      command_user_id: string;
    }>();
  });

  it('types private Suggestion commands without exposing Suggestion tables', () => {
    expectTypeOf<PublicFunctions['submit_place_suggestion']['Args']>().toEqualTypeOf<{
      command_proposal: Json;
      command_request_id: string;
    }>();
    expectTypeOf<PublicFunctions['confirm_suggestion_contribution']['Args']>().toEqualTypeOf<{
      command_request_id: string;
      requested_suggestion_id: string;
    }>();
    expectTypeOf<
      PublicFunctions['confirm_suggestion_contribution']['Returns'][number]
    >().toEqualTypeOf<{
      confirmed_at: string;
      contribution_id: string;
    }>();
    expectTypeOf<PublicFunctions['list_my_place_suggestions']['Args']>().toEqualTypeOf<{
      cursor_submitted_at?: string;
      cursor_suggestion_id?: string;
      requested_limit?: number;
    }>();
    expectTypeOf<
      PublicFunctions['list_moderation_place_suggestions']['Returns'][number]
    >().not.toHaveProperty('proposal');
    expectTypeOf<PublicFunctions['get_moderation_place_suggestion']['Returns'][number]>()
      .toHaveProperty('proposal')
      .toEqualTypeOf<Json>();
    expectTypeOf<PublicFunctions['resolve_place_suggestion']['Args']>()
      .toHaveProperty('requested_operator_identity_place_id')
      .toEqualTypeOf<string>();
    expectTypeOf<PublicFunctions['resolve_place_suggestion']['Args']>()
      .toHaveProperty('requested_location_identity_place_id')
      .toEqualTypeOf<string>();
  });
});
