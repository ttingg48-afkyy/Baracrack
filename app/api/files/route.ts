import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase";
import { userSandbox, safePath } from "@/lib/sandbox";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const path = safePath(url.searchParams.get("path") || ".");
    const sbx = await userSandbox(user.id);
    const cmd = await sbx.runCommand({cmd:"bash",args:["-lc",`find '${path.replace(/'/g,"'\\''")}' -maxdepth 1 -mindepth 1 -printf '%y\\t%f\\n' 2>/dev/null | sort`],timeoutMs:20000});
    return NextResponse.json({path, entries:(await cmd.stdout()).split("\\n").filter(Boolean).map(line=>{
      const [type,...name]=line.split("\\t"); return {type:type==="d"?"dir":"file",name:name.join("\\t")};
    })});
  } catch(e:any) { return NextResponse.json({error:e.message||"File error"},{status:500}); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const {path, content, action} = await req.json();
    const target = safePath(String(path||""));
    const sbx = await userSandbox(user.id);
    if (action === "mkdir") {
      const r=await sbx.runCommand({cmd:"mkdir",args:["-p",target]});
      return NextResponse.json({ok:r.exitCode===0});
    }
    if (action === "delete") {
      const r=await sbx.runCommand({cmd:"rm",args:["-rf","--",target]});
      return NextResponse.json({ok:r.exitCode===0});
    }
    if (action === "read") {
      const r=await sbx.runCommand({cmd:"cat",args:[target]});
      return NextResponse.json({content:await r.stdout(),stderr:await r.stderr(),exitCode:r.exitCode});
    }
    if (action === "write") {
      const b64=Buffer.from(String(content??""),"utf8").toString("base64");
      const r=await sbx.runCommand({cmd:"bash",args:["-lc",`mkdir -p "$(dirname '${target.replace(/'/g,"'\\''")}')" && printf %s '${b64}' | base64 -d > '${target.replace(/'/g,"'\\''")}'`]});
      return NextResponse.json({ok:r.exitCode===0,stderr:await r.stderr()});
    }
    return NextResponse.json({error:"Action tidak dikenal"},{status:400});
  } catch(e:any) { return NextResponse.json({error:e.message||"File error"},{status:500}); }
    }
