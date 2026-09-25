import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString();

    // 1. Purge from transactions (receipt-photos)
    // In V2, we might not have 'transactions' with 'photo_url'. Assuming goods_receipts or similar.
    // Based on WBS 1.3.2.2: SELECT id, photo_url FROM transactions WHERE created_at < NOW() - INTERVAL '90 days' AND is_purged = false
    // Since WBS explicitly mentions 'transactions', we'll query it if it exists.
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("id, photo_url")
      .lt("created_at", dateStr)
      .eq("is_photo_purged", false)
      .not("photo_url", "is", null);

    if (!txError && transactions) {
      for (const tx of transactions) {
        if (tx.photo_url) {
          // Extract filename from URL (assuming format: bucket/folder/filename)
          const urlParts = tx.photo_url.split('/');
          const filename = urlParts[urlParts.length - 1];
          await supabase.storage.from("receipt-photos").remove([filename]);
          
          await supabase
            .from("transactions")
            .update({ photo_url: null, is_photo_purged: true })
            .eq("id", tx.id);
        }
      }
    }

    // 2. Purge from production_trimming_batches (trimming-photos)
    const { data: batches, error: batchError } = await supabase
      .from("production_trimming_batches")
      .select("id, gross_photo_url, clean_photo_url, waste_photo_url")
      .lt("created_at", dateStr);

    if (!batchError && batches) {
      for (const batch of batches) {
        const filesToRemove = [];
        const extractFilename = (url) => {
           if (!url) return null;
           const parts = url.split('/');
           return parts[parts.length - 1];
        };

        if (batch.gross_photo_url) filesToRemove.push(extractFilename(batch.gross_photo_url));
        if (batch.clean_photo_url) filesToRemove.push(extractFilename(batch.clean_photo_url));
        if (batch.waste_photo_url) filesToRemove.push(extractFilename(batch.waste_photo_url));

        if (filesToRemove.length > 0) {
          await supabase.storage.from("trimming-photos").remove(filesToRemove.filter(Boolean));
          
          await supabase
            .from("production_trimming_batches")
            .update({ 
               gross_photo_url: null, 
               clean_photo_url: null, 
               waste_photo_url: null 
            })
            .eq("id", batch.id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Purge completed" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
