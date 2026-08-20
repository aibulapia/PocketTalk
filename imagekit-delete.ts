import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const authHeader = req.headers.get("Authorization") ?? ""
    if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const privateKey = Deno.env.get("IMAGEKIT_PRIVATE_KEY")
    if (!privateKey) throw new Error("IMAGEKIT_PRIVATE_KEY is not configured")
    const supabase = createClient(supabaseUrl, anonKey, { global:{ headers:{ Authorization:authHeader } } })
    const { data:{ user }, error:userError } = await supabase.auth.getUser()
    if (userError || !user) return Response.json({error:"Unauthorized"},{status:401,headers:corsHeaders})
    const { postId } = await req.json()
    if (!postId) throw new Error("postId is required")
    const { data: post, error:postError } = await supabase.from("posts").select("id,author_id").eq("id",postId).single()
    if (postError || !post) throw new Error("Post not found")
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id",user.id).single()
    if (post.author_id !== user.id && !profile?.is_admin) return Response.json({error:"Forbidden"},{status:403,headers:corsHeaders})
    const { data: images, error:imageError } = await supabase.from("post_images").select("id,imagekit_file_id").eq("post_id",postId)
    if (imageError) throw imageError
    for (const image of images || []) {
      if (!image.imagekit_file_id) continue
      const res = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(image.imagekit_file_id)}`, {
        method:"DELETE", headers:{ Authorization:`Basic ${btoa(privateKey + ':')}` }
      })
      if (!res.ok && res.status !== 404) throw new Error(`ImageKit delete failed: ${res.status}`)
    }
    const { error:dbError } = await supabase.from("post_images").delete().eq("post_id",postId)
    if (dbError) throw dbError
    return Response.json({ok:true},{headers:{...corsHeaders,"Content-Type":"application/json"}})
  } catch (e) {
    return Response.json({error:e instanceof Error?e.message:"Delete failed"},{status:500,headers:{...corsHeaders,"Content-Type":"application/json"}})
  }
})
