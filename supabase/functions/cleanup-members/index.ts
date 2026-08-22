import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const phoneToKeep = "+919884576080"; // Vijay

    // Get all members
    const { data: allMembers, error: membersError } = await supabase
      .from("member_profiles")
      .select("id, full_name, mobile");

    if (membersError) throw membersError;

    // Find member to keep
    const memberToKeep = allMembers.find((m) => m.mobile === phoneToKeep);
    if (!memberToKeep) {
      return Response.json({ error: `Member with phone ${phoneToKeep} not found` }, { status: 404, headers: corsHeaders });
    }

    // Get members to delete
    const membersToDelete = allMembers.filter((m) => m.mobile !== phoneToKeep);

    let deletedCount = 0;

    for (const member of membersToDelete) {
      // Delete related records
      await supabase.from("group_memberships").delete().eq("member_profile_id", member.id);
      await supabase.from("payments").delete().eq("member_profile_id", member.id);
      await supabase.from("dividends").delete().eq("member_profile_id", member.id);
      await supabase.from("winners").delete().eq("member_profile_id", member.id);
      await supabase.from("auction_bids").delete().eq("member_profile_id", member.id);
      await supabase.from("plan_requests").delete().eq("member_profile_id", member.id);

      // Delete member profile
      const { error: deleteError } = await supabase
        .from("member_profiles")
        .delete()
        .eq("id", member.id);

      if (!deleteError) {
        deletedCount++;
      }
    }

    return Response.json(
      {
        success: true,
        kept: memberToKeep.full_name,
        deletedCount,
        message: `Deleted ${deletedCount} members. Kept ${memberToKeep.full_name}.`,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
});
