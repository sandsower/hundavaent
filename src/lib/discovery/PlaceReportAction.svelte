<script lang="ts">
  import type { Catalogue, MessageKey } from '$i18n';
  import {
    submittedPlaceReportFlag,
    type PendingPlaceFlag,
    type PlaceReportReason
  } from '$lib/contributions/correction';
  import { submitPlaceReport, type PlaceReportResult } from '$lib/contributions/correction-client';
  import InlineCorrectionShell from '$lib/discovery/InlineCorrectionShell.svelte';

  /**
   * One place-level Report claim over the shared shell. The claim is the trigger: "this place is
   * closed" is complete as written, so the expanded editor asks only for confirmation and an
   * optional private note. There is nothing to choose, and offering a choice would suggest the
   * Member had not already made one.
   */
  interface Props {
    placeId: string;
    placeName: string;
    copy: Catalogue;
    signedIn: boolean;
    reason: PlaceReportReason;
    announce?: (message: string) => void;
    /** Reports what was just sent, so the card can suppress this reason without a refetch. */
    onSubmitted?: (flag: PendingPlaceFlag) => void;
  }

  let {
    placeId,
    placeName,
    copy,
    signedIn,
    reason,
    announce = () => undefined,
    onSubmitted = () => undefined
  }: Props = $props();

  const actionLabels: Record<PlaceReportReason, MessageKey> = {
    closed: 'placeReport.closed',
    moved: 'placeReport.moved',
    unsafe: 'placeReport.unsafe'
  };

  const startLabels: Record<PlaceReportReason, MessageKey> = {
    closed: 'placeReport.closedLabel',
    moved: 'placeReport.movedLabel',
    unsafe: 'placeReport.unsafeLabel'
  };

  const legends: Record<PlaceReportReason, MessageKey> = {
    closed: 'placeReport.legendClosed',
    moved: 'placeReport.legendMoved',
    unsafe: 'placeReport.legendUnsafe'
  };

  async function send(note: string | null): Promise<PlaceReportResult> {
    const result = await submitPlaceReport({ placeId, reason, note });
    if (result.status === 'submitted') onSubmitted(submittedPlaceReportFlag(reason));
    return result;
  }
</script>

<InlineCorrectionShell
  {copy}
  {signedIn}
  {announce}
  {send}
  startText={copy[actionLabels[reason]]}
  startLabel={copy[startLabels[reason]].replace('{name}', placeName)}
  legend={copy[legends[reason]]}
  canSend
/>
