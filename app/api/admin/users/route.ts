import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await requireUser();
    if (user.email?.toLowerCase() !== process.env.BARA_ADMIN_EMAIL?.toLowerCase()) {
      return NextResponse.json({error:"Forbidden"},{status:403});
    }
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const {data,error}=await admin.auth.admin.listUsers({page:1,perPage:100});
    if(error) throw error;
    return NextResponse.json({users:data.users.map(u=>({
      id:u.id,email:u.email,created_at:u.created_at,last_sign_in_at:u.last_sign_in_at,
      banned_until:u.banned_until
    }))});
  } catch(e:any) { return NextResponse.json({error:e.message||"Admin error"},{status:500}); }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (user.email?.toLowerCase() !== process.env.BARA_ADMIN_EMAIL?.toLowerCase()) return NextResponse.json({error:"Forbidden"},{status:403});
    const {id, action} = await req.json();
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const ban_duration = action==="permanent" ? "876000h" : action==="ban" ? "24h" : "none";
    const {error}=await admin.auth.admin.updateUserById(id,{ban_duration});
    if(error) throw error;
    return NextResponse.json({ok:true});
  } catch(e:any) { return NextResponse.json({error:e.message||"Admin error"},{status:500}); }
}
