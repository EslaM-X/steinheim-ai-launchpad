import type { SupabaseClient } from "@supabase/supabase-js";

type DB = SupabaseClient<any, "public", any>;

/**
 * Human approval applied from outside the dashboard (today: Telegram).
 *
 * The rule is intentionally duplicated from `setHumanApproval` in
 * `src/lib/testing.functions.ts` rather than shared, because that file is the
 * dashboard's approval path and is not being modified. Both must stay in step:
 * **a post can only be human approved if the AI approved it and it did not hard
 * fail.** If you change one, change the other.
 *
 * Approving never publishes. It moves the post to `approved`, and the publisher
 * picks it up from the queue on its own schedule.
 *
 * TODO(tech-debt): centralize the approval eligibility predicate as
 * `canHumanApprove(post)` shared by production and the test harness, once the
 * test harness is refactored. Deliberately deferred — not worth touching
 * `testing.functions.ts` for this alone.
 */
export async function applyHumanApproval(
  supabase: DB,
  postId: string,
  approve: boolean,
  approverUserId: string | null,
): Promise<{ ok: true; status: string } | { ok: false; reason: string }> {
  const { data: post, error: readError } = await supabase
    .from("posts")
    .select("id, ai_approved, hard_fail, status, platform")
    .eq("id", postId)
    .maybeSingle();
  if (readError) return { ok: false, reason: readError.message };
  if (!post) return { ok: false, reason: "Post not found" };

  if (approve && (!post.ai_approved || post.hard_fail)) {
    return {
      ok: false,
      reason: "This post has not passed AI approval — it cannot be human approved.",
    };
  }
  if (post.status === "published" || post.status === "publishing") {
    return { ok: false, reason: `Post is already ${post.status}.` };
  }

  const update = approve
    ? {
        status: "approved",
        human_approved_by: approverUserId,
        human_approved_at: new Date().toISOString(),
      }
    : { status: "needs_revision", human_approved_by: null, human_approved_at: null };

  const { error } = await supabase.from("posts").update(update).eq("id", postId);
  if (error) return { ok: false, reason: error.message };

  return { ok: true, status: update.status };
}
