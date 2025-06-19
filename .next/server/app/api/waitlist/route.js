(()=>{var e={};e.id=282,e.ids=[282],e.modules={30517:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},14300:e=>{"use strict";e.exports=require("buffer")},6113:e=>{"use strict";e.exports=require("crypto")},82361:e=>{"use strict";e.exports=require("events")},57147:e=>{"use strict";e.exports=require("fs")},13685:e=>{"use strict";e.exports=require("http")},95687:e=>{"use strict";e.exports=require("https")},41808:e=>{"use strict";e.exports=require("net")},22037:e=>{"use strict";e.exports=require("os")},71017:e=>{"use strict";e.exports=require("path")},12781:e=>{"use strict";e.exports=require("stream")},24404:e=>{"use strict";e.exports=require("tls")},57310:e=>{"use strict";e.exports=require("url")},59796:e=>{"use strict";e.exports=require("zlib")},93739:()=>{},30982:(e,t,r)=>{"use strict";r.r(t),r.d(t,{headerHooks:()=>T,originalPathname:()=>N,patchFetch:()=>h,requestAsyncStorage:()=>E,routeModule:()=>d,serverHooks:()=>w,staticGenerationAsyncStorage:()=>p,staticGenerationBailout:()=>f});var s={};r.r(s),r.d(s,{GET:()=>l,POST:()=>u});var a=r(95419),i=r(69108),o=r(99678),c=r(78070),n=r(99568);async function u(e){try{let{name:t,email:r}=await e.json();if(!t||!r)return c.Z.json({error:"Name and email are required"},{status:400});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r))return c.Z.json({error:"Invalid email address"},{status:400});let s=await n.E.addToWaitlist(r,t);if(s.success)return console.log("✅ Waitlist signup successful:",{name:t,email:r}),c.Z.json({success:!0,message:"Successfully added to waitlist! We'll be in touch soon."});return console.error("❌ Database error:",s.error),c.Z.json({error:"Failed to join waitlist"},{status:500})}catch(e){return console.error("Waitlist error:",e),c.Z.json({error:"Failed to join waitlist"},{status:500})}}async function l(){try{let e=await n.E.getWaitlist();if(e.success)return c.Z.json({waitlist:e.data});return console.error("❌ Failed to fetch waitlist:",e.error),c.Z.json({error:"Failed to fetch waitlist"},{status:500})}catch(e){return console.error("Waitlist GET error:",e),c.Z.json({error:"Failed to fetch waitlist"},{status:500})}}let d=new a.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/waitlist/route",pathname:"/api/waitlist",filename:"route",bundlePath:"app/api/waitlist/route"},resolvedPagePath:"/Volumes/U34 Bolt/HELFI APP/helfi-app/app/api/waitlist/route.ts",nextConfigOutput:"",userland:s}),{requestAsyncStorage:E,staticGenerationAsyncStorage:p,serverHooks:w,headerHooks:T,staticGenerationBailout:f}=d,N="/api/waitlist/route";function h(){return(0,o.patchFetch)({serverHooks:w,staticGenerationAsyncStorage:p})}},99568:(e,t,r)=>{"use strict";r.d(t,{E:()=>a});var s=r(41658);class a{static async init(){try{return await s.i6`
        CREATE TABLE IF NOT EXISTS user_health_data (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `,await s.i6`
        CREATE TABLE IF NOT EXISTS waitlist (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `,console.log("✅ Vercel Database initialized successfully"),{success:!0}}catch(e){return console.error("❌ Database initialization failed:",e),{success:!1,error:e instanceof Error?e.message:"Unknown error"}}}static async saveUserData(e,t){try{await this.init();let r=await s.i6`
        INSERT INTO user_health_data (email, data, updated_at)
        VALUES (${e}, ${JSON.stringify(t)}, NOW())
        ON CONFLICT (email)
        DO UPDATE SET data = ${JSON.stringify(t)}, updated_at = NOW()
        RETURNING *
      `;return console.log("✅ User data saved successfully to Vercel Postgres"),{success:!0,data:r.rows[0]}}catch(e){return console.error("❌ Failed to save user data:",e),{success:!1,error:e instanceof Error?e.message:"Unknown error"}}}static async getUserData(e){try{await this.init();let t=await s.i6`
        SELECT data FROM user_health_data 
        WHERE email = ${e}
      `;if(t.rows.length>0)return console.log("✅ User data retrieved successfully from Vercel Postgres"),{success:!0,data:t.rows[0].data};return console.log("ℹ️ No data found for user"),{success:!0,data:null}}catch(e){return console.error("❌ Failed to retrieve user data:",e),{success:!1,error:e instanceof Error?e.message:"Unknown error"}}}static async addToWaitlist(e,t){try{await this.init();let r=await s.i6`
        INSERT INTO waitlist (email, name)
        VALUES (${e}, ${t})
        ON CONFLICT (email) DO NOTHING
        RETURNING *
      `;return console.log("✅ Added to waitlist successfully"),{success:!0,data:r.rows[0]}}catch(e){return console.error("❌ Failed to add to waitlist:",e),{success:!1,error:e instanceof Error?e.message:"Unknown error"}}}static async getWaitlist(){try{await this.init();let e=await s.i6`
        SELECT * FROM waitlist 
        ORDER BY created_at DESC
      `;return console.log("✅ Waitlist retrieved successfully"),{success:!0,data:e.rows}}catch(e){return console.error("❌ Failed to retrieve waitlist:",e),{success:!1,error:e instanceof Error?e.message:"Unknown error"}}}}}};var t=require("../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),s=t.X(0,[638,206,292],()=>r(30982));module.exports=s})();