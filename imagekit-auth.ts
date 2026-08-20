import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const authHeader = req.headers.get("Authorization") || ""
    if (!authHeader.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })

    const privateKey = Deno.env.get("IMAGEKIT_PRIVATE_KEY")
    if (!privateKey) throw new Error("IMAGEKIT_PRIVATE_KEY is not configured")

    const token = crypto.randomUUID()
    const expire = Math.floor(Date.now() / 1000) + 600
    const payload = token + expire
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(privateKey), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
    const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("")

    return new Response(JSON.stringify({ token, expire, signature }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Authentication failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
