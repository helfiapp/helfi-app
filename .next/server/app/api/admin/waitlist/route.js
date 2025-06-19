(()=>{var t={};t.id=613,t.ids=[613],t.modules={30517:t=>{"use strict";t.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},14300:t=>{"use strict";t.exports=require("buffer")},6113:t=>{"use strict";t.exports=require("crypto")},82361:t=>{"use strict";t.exports=require("events")},57147:t=>{"use strict";t.exports=require("fs")},13685:t=>{"use strict";t.exports=require("http")},95687:t=>{"use strict";t.exports=require("https")},41808:t=>{"use strict";t.exports=require("net")},22037:t=>{"use strict";t.exports=require("os")},71017:t=>{"use strict";t.exports=require("path")},12781:t=>{"use strict";t.exports=require("stream")},24404:t=>{"use strict";t.exports=require("tls")},57310:t=>{"use strict";t.exports=require("url")},59796:t=>{"use strict";t.exports=require("zlib")},93739:()=>{},41863:(t,e,r)=>{"use strict";r.r(e),r.d(e,{headerHooks:()=>w,originalPathname:()=>h,patchFetch:()=>N,requestAsyncStorage:()=>d,routeModule:()=>l,serverHooks:()=>p,staticGenerationAsyncStorage:()=>E,staticGenerationBailout:()=>T});var s={};r.r(s),r.d(s,{GET:()=>u});var a=r(95419),i=r(69108),o=r(99678),c=r(78070),n=r(99568);async function u(t){try{let t=await n.E.getWaitlist();if(!t.success)return console.error("Failed to fetch waitlist:",t.error),c.Z.json({error:"Failed to fetch waitlist data",waitlist:[],count:0},{status:500});{let e=t.data||[];return c.Z.json({success:!0,waitlist:e,count:e.length})}}catch(t){return console.error("Failed to fetch waitlist:",t),c.Z.json({error:"Failed to fetch waitlist data",waitlist:[],count:0},{status:500})}}let l=new a.AppRouteRouteModule({definition:{kind:i.x.APP_ROUTE,page:"/api/admin/waitlist/route",pathname:"/api/admin/waitlist",filename:"route",bundlePath:"app/api/admin/waitlist/route"},resolvedPagePath:"/Volumes/U34 Bolt/HELFI APP/helfi-app/app/api/admin/waitlist/route.ts",nextConfigOutput:"",userland:s}),{requestAsyncStorage:d,staticGenerationAsyncStorage:E,serverHooks:p,headerHooks:w,staticGenerationBailout:T}=l,h="/api/admin/waitlist/route";function N(){return(0,o.patchFetch)({serverHooks:p,staticGenerationAsyncStorage:E})}},99568:(t,e,r)=>{"use strict";r.d(e,{E:()=>a});var s=r(41658);class a{static async init(){try{return await s.i6`
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
      `,console.log("✅ Vercel Database initialized successfully"),{success:!0}}catch(t){return console.error("❌ Database initialization failed:",t),{success:!1,error:t instanceof Error?t.message:"Unknown error"}}}static async saveUserData(t,e){try{await this.init();let r=await s.i6`
        INSERT INTO user_health_data (email, data, updated_at)
        VALUES (${t}, ${JSON.stringify(e)}, NOW())
        ON CONFLICT (email)
        DO UPDATE SET data = ${JSON.stringify(e)}, updated_at = NOW()
        RETURNING *
      `;return console.log("✅ User data saved successfully to Vercel Postgres"),{success:!0,data:r.rows[0]}}catch(t){return console.error("❌ Failed to save user data:",t),{success:!1,error:t instanceof Error?t.message:"Unknown error"}}}static async getUserData(t){try{await this.init();let e=await s.i6`
        SELECT data FROM user_health_data 
        WHERE email = ${t}
      `;if(e.rows.length>0)return console.log("✅ User data retrieved successfully from Vercel Postgres"),{success:!0,data:e.rows[0].data};return console.log("ℹ️ No data found for user"),{success:!0,data:null}}catch(t){return console.error("❌ Failed to retrieve user data:",t),{success:!1,error:t instanceof Error?t.message:"Unknown error"}}}static async addToWaitlist(t,e){try{await this.init();let r=await s.i6`
        INSERT INTO waitlist (email, name)
        VALUES (${t}, ${e})
        ON CONFLICT (email) DO NOTHING
        RETURNING *
      `;return console.log("✅ Added to waitlist successfully"),{success:!0,data:r.rows[0]}}catch(t){return console.error("❌ Failed to add to waitlist:",t),{success:!1,error:t instanceof Error?t.message:"Unknown error"}}}static async getWaitlist(){try{await this.init();let t=await s.i6`
        SELECT * FROM waitlist 
        ORDER BY created_at DESC
      `;return console.log("✅ Waitlist retrieved successfully"),{success:!0,data:t.rows}}catch(t){return console.error("❌ Failed to retrieve waitlist:",t),{success:!1,error:t instanceof Error?t.message:"Unknown error"}}}}}};var e=require("../../../../webpack-runtime.js");e.C(t);var r=t=>e(e.s=t),s=e.X(0,[638,206,292],()=>r(41863));module.exports=s})();