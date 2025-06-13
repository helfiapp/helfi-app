"use strict";(()=>{var e={};e.id=297,e.ids=[297],e.modules={53524:e=>{e.exports=require("@prisma/client")},30517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},48391:(e,t,r)=>{r.r(t),r.d(t,{headerHooks:()=>f,originalPathname:()=>y,patchFetch:()=>g,requestAsyncStorage:()=>d,routeModule:()=>c,serverHooks:()=>b,staticGenerationAsyncStorage:()=>h,staticGenerationBailout:()=>m});var i={};r.r(i),r.d(i,{GET:()=>u,POST:()=>p});var s=r(95419),o=r(69108),a=r(99678),n=r(78070),l=r(3214);async function u(e){try{let{searchParams:t}=new URL(e.url),r=t.get("email"),i=t.get("token");if(!r||!i)return new Response(`
        <html>
          <head><title>Unsubscribe - Helfi</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <div style="text-align: center;">
              <h1 style="color: #ef4444;">Invalid Unsubscribe Link</h1>
              <p>This unsubscribe link is invalid or has expired.</p>
              <p>If you continue to receive emails, please contact <a href="mailto:support@helfi.ai">support@helfi.ai</a></p>
            </div>
          </body>
        </html>
        `,{headers:{"Content-Type":"text/html"}});let s=Buffer.from(`unsubscribe_${r}_helfi`).toString("base64url");if(i!==s)return new Response(`
        <html>
          <head><title>Unsubscribe - Helfi</title></head>
          <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
            <div style="text-align: center;">
              <h1 style="color: #ef4444;">Invalid Token</h1>
              <p>This unsubscribe link is invalid or has been tampered with.</p>
              <p>If you continue to receive emails, please contact <a href="mailto:support@helfi.ai">support@helfi.ai</a></p>
            </div>
          </body>
        </html>
        `,{headers:{"Content-Type":"text/html"}});try{await l._.$executeRaw`
        DELETE FROM "Waitlist" WHERE email = ${r}
      `}catch(e){console.error("Database error during unsubscribe:",e)}return new Response(`
      <html>
        <head>
          <title>Unsubscribed - Helfi</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success { background: #dcfce7; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; text-align: center; }
            .logo { color: #10b981; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="success">
            <div class="logo">Helfi</div>
            <h1 style="color: #22c55e; margin-top: 0;">Successfully Unsubscribed</h1>
            <p style="color: #374151; font-size: 16px;">
              <strong>${r}</strong> has been removed from our mailing list.
            </p>
            <p style="color: #6b7280;">
              You will no longer receive emails from Helfi. If you change your mind, 
              you can always sign up again at <a href="https://helfi.ai" style="color: #10b981;">helfi.ai</a>
            </p>
            <p style="color: #9ca3af; font-size: 14px; margin-top: 30px;">
              We're sorry to see you go! 👋
            </p>
          </div>
        </body>
      </html>
      `,{headers:{"Content-Type":"text/html"}})}catch(e){return console.error("Unsubscribe error:",e),new Response(`
      <html>
        <head><title>Error - Helfi</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <div style="text-align: center;">
            <h1 style="color: #ef4444;">Error</h1>
            <p>Something went wrong processing your unsubscribe request.</p>
            <p>Please contact <a href="mailto:support@helfi.ai">support@helfi.ai</a> for assistance.</p>
          </div>
        </body>
      </html>
      `,{headers:{"Content-Type":"text/html"}})}}async function p(e){try{let{email:t}=await e.json();if(!t)return n.Z.json({error:"Email is required"},{status:400});let r=Buffer.from(`unsubscribe_${t}_helfi`).toString("base64url"),i=`${process.env.NEXTAUTH_URL||"https://helfi.ai"}/api/unsubscribe?email=${encodeURIComponent(t)}&token=${r}`;return n.Z.json({success:!0,unsubscribeUrl:i})}catch(e){return console.error("Unsubscribe generation error:",e),n.Z.json({error:"Failed to generate unsubscribe link"},{status:500})}}let c=new s.AppRouteRouteModule({definition:{kind:o.x.APP_ROUTE,page:"/api/unsubscribe/route",pathname:"/api/unsubscribe",filename:"route",bundlePath:"app/api/unsubscribe/route"},resolvedPagePath:"/Volumes/U34 Bolt/HELFI APP/helfi-app/app/api/unsubscribe/route.ts",nextConfigOutput:"",userland:i}),{requestAsyncStorage:d,staticGenerationAsyncStorage:h,serverHooks:b,headerHooks:f,staticGenerationBailout:m}=c,y="/api/unsubscribe/route";function g(){return(0,a.patchFetch)({serverHooks:b,staticGenerationAsyncStorage:h})}},3214:(e,t,r)=>{r.d(t,{_:()=>s});var i=r(53524);let s=globalThis.prisma??new i.PrismaClient}};var t=require("../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),i=t.X(0,[638,206],()=>r(48391));module.exports=i})();