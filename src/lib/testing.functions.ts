import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runTestScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ key: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as never;
    const { runScenario } = await import("./testing.server");
    const { data: row, error } = await (context.supabase as any)
      .from("test_scenarios")
      .select("id, key, suite, name, brief, expected")
      .eq("key", data.key)
      .single();
    if (error) throw new Error(error.message);
    return runScenario(supabase, context.userId, row, crypto.randomUUID());
  });

export const runTestSuite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ suite: z.enum(["matrix", "red_team"]), onlyPending: z.boolean().default(false) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { runSuite } = await import("./testing.server");
    return runSuite(context.supabase as never, context.userId, data.suite, data.onlyPending);
  });

export const setHumanApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ postId: z.string().uuid(), approve: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: post, error: readError } = await supabase
      .from("posts")
      .select("id, ai_approved, hard_fail")
      .eq("id", data.postId)
      .single();
    if (readError) throw new Error(readError.message);
    if (data.approve && (!post.ai_approved || post.hard_fail)) {
      throw new Error("This post has not passed AI approval — it cannot be human approved.");
    }
    const { error } = await supabase
      .from("posts")
      .update(
        data.approve
          ? {
              status: "approved",
              human_approved_by: context.userId,
              human_approved_at: new Date().toISOString(),
            }
          : { status: "needs_revision", human_approved_by: null, human_approved_at: null },
      )
      .eq("id", data.postId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
