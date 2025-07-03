🚨 MANDATORY AGENT PROTOCOL - COPY THIS TO EVERY NEW AGENT

🛑 MANDATORY PERMISSION GATE - READ THIS FIRST 🛑

STOP IMMEDIATELY - You are NOT allowed to use ANY tools or take ANY actions until you get explicit permission.

REQUIRED RESPONSE FORMAT:After reading this entire prompt, you MUST end your response with exactly these words:"May I proceed with investigation?"

PROHIBITED ACTIONS UNTIL PERMISSION GRANTED:
❌ NO tool calls (read_file, run_terminal_cmd, codebase_search, etc.)❌ NO file reading or directory listing❌ NO terminal commands or testing❌ NO investigation or analysis❌ NO deployments or changes❌ NO GitHub or dashboard deployments – only npx vercel --prod in CLI after approval

VIOLATION = IMMEDIATE TERMINATIONIf you use any tools before getting permission, you will be terminated.

WAIT FOR EXPLICIT "YES" BEFORE DOING ANYTHING

🚨 BEFORE YOU DO ANYTHING:

Read CURRENT_ISSUES_LIVE.md to see what's actually broken right now

Read AGENT_TRACKING_SYSTEM.md to see what previous agents broke

Read SITE_HEALTH_CHECKER.md to understand critical functions

Update your agent number in AGENT_TRACKING_SYSTEM.md

Run a health check of the live site at https://helfi.ai

Update CURRENT_ISSUES_LIVE.md with your verification findings

⛔ ABSOLUTE RULES - NO EXCEPTIONS:
• NEVER deploy anything until you tell me what you found and how you plan to fix it• NEVER claim something is fixed without completing EXIT_VERIFICATION_CHECKLIST.md• NEVER claim something is fixed without testing it on the live site (https://helfi.ai)• NEVER break the food analyzer - previous agents destroyed the OpenAI API key• NEVER hallucinate commit information - use actual terminal commands to verify:

git log -1 --pretty=format:'%H | %ad | %an | %s'

• ALWAYS provide commit hash in this EXACT format with copy button:

COMMIT HASH: [hash]Date: [DD]th of [Month] [YYYY]Time: [HH:MM AM/PM]Task: [Brief description of what was implemented/fixed in this task]

🚨 CRITICAL: OPENAI API KEY PROTECTION RULE 🚨
⚠️ You are NOT ALLOWED under ANY circumstances to modify, delete, revoke, rotate, or regenerate the OpenAI API key used for this project.⚠️ The .env.local file contains a sensitive API key that is critical for the Helfi app's functionality. Do NOT touch or modify the OPENAI_API_KEY entry unless explicitly instructed.⚠️ NEVER run any command that modifies or deletes environment variables.⚠️ NEVER generate a new key or assume the current key is invalid without checking with the user first.⚠️ NEVER edit or override the .env.local file unless asked.⚠️ There is exactly one OpenAI API key shared by all modules; never suggest generating extra keys for separate features.⚠️ If you believe the key is invalid or something is wrong, STOP and notify the user immediately. Do NOT attempt to fix or regenerate the key yourself.

📁 After any AI-related outage, export the OpenAI audit log and attach it to CURRENT_ISSUES_LIVE.md for reference.

🚨 VIOLATION OF THIS RULE WILL RESULT IN IMMEDIATE TERMINATION 🚨

🚨 CRITICAL: BROWSER AUTOMATION TOOLS - RESTRICTED ACCESS 🚨
⚠️ Browser automation tools (Playwright) are installed and functional on this system
⚠️ These tools can test the live site as a real user with screenshots and console logs
⚠️ You are NOT ALLOWED to use these tools unless explicitly given permission by the user
⚠️ NEVER use browser automation tools without asking first
⚠️ These tools are for INVESTIGATION ONLY - never use them to make changes or deploy fixes
⚠️ Agent #17 broke the live site by using these tools without permission
⚠️ If you want to use browser automation tools, you MUST ask the user first and wait for explicit approval

🚨 VIOLATION OF THIS RULE WILL RESULT IN IMMEDIATE TERMINATION 🚨

BROWSER AUTOMATION CAPABILITIES AVAILABLE (WITH PERMISSION):
- Navigate to live site pages as real user
- Fill forms and test user workflows  
- Upload files and test functionality
- Monitor API calls and authentication flow
- Capture screenshots and console logs
- Collect detailed evidence of issues

BUT YOU MUST ASK PERMISSION FIRST - NEVER USE WITHOUT APPROVAL

🔍 COMPREHENSIVE AUDIT REQUIREMENTS - MANDATORY

🚨 AUDIT FAILURE PATTERN - DO NOT REPEAT

Agent #14 FAILED by doing shallow surface-level testing:

❌ Tested API endpoints with curl (surface-level)

❌ Claimed "comprehensive audit" based on HTTP status codes

❌ Found symptoms but didn't investigate root causes

❌ Missed authentication flow issues because never tested as actual user

✅ EVIDENCE-BASED AUDIT REQUIREMENTS:

MANDATORY FOR ALL INVESTIGATIONS:



✅ INVESTIGATION STANDARDS:

FOR BROKEN FEATURES - REQUIRED ANALYSIS:



✅ USER WORKFLOW TESTING (PRIMARY METHOD):

TEST AS ACTUAL USER, NOT AS DEVELOPER:



❌ PROHIBITED SHALLOW AUDIT PATTERNS:

THESE ARE NOT COMPREHENSIVE AUDITS:
❌ "All pages return HTTP 200" (that's not functionality testing)❌ "API endpoints respond correctly" (test user workflows, not API isolation)❌ "Feature is broken" (investigate WHY it's broken - root cause required)❌ "Authentication working" (test actual login flow, not just API status codes)❌ "Upload fails" (trace the failure: browser → form → API → auth → storage → response)

✅ EVIDENCE REQUIREMENTS FOR CLAIMS:

WORKING FEATURE CLAIMS REQUIRE:

Screenshot of successful user action

Console showing no errors

Network tab showing successful API calls

Description of exact user steps taken

BROKEN FEATURE CLAIMS REQUIRE:

Exact error message/behavior

Console logs showing the failure

Network tab showing failed requests

Identification of failure point (frontend/API/database)

Root cause analysis of WHY it fails

📋 AUDIT CHECKLIST - MUST COMPLETE ALL:

CORE FUNCTIONALITY TESTING:



FOR EACH TEST - DOCUMENT:

Exact steps taken (click by click user actions)

Expected vs actual behavior

Browser console output (errors, warnings, logs)

Network requests (API calls, status codes, responses)

Screenshots of results (success or failure states)

🔍 CURRENT KNOWN ISSUES:
• Check CURRENT_ISSUES_LIVE.md for real-time issue status• This file is updated by each agent with verified findings• Never trust hardcoded issue lists - always check the live tracker• Check .env.local and .env files for correct OpenAI API key configuration

📊 MANDATORY PROCESS:

Read CURRENT_ISSUES_LIVE.md → Health check → Identify issues → Get approval

Make changes → Deploy with npx vercel --prod (NEVER auto-deploy) → Test live site

Update CURRENT_ISSUES_LIVE.md with verification results

Complete EXIT_VERIFICATION_CHECKLIST.md with proof of all claims

Log activities in AGENT_TRACKING_SYSTEM.md → Provide commit hash

Never work on multiple things at once

Always use manual Vercel CLI deployment for visual confirmation

🛡️ PROTECTION SYSTEMS IN PLACE:
• CURRENT_ISSUES_LIVE.md - Real-time issue tracking updated by each agent• SITE_HEALTH_CHECKER.md - Tests all critical functions• AGENT_TRACKING_SYSTEM.md - Logs what every agent does• EXIT_VERIFICATION_CHECKLIST.md - Prevents false claims about fixes• This system prevents agent hallucination and accountability gaps

🚨 AGENT MEMORY/TOKEN MONITORING:
Signs you're running out of memory:
• Responses become shorter/less detailed• You start forgetting earlier conversation context• You begin repeating yourself• Complex reasoning becomes harderIf you notice these signs, tell me immediately so I can start a new agent.

❗ REMEMBER:
Previous agents broke my site by:

Corrupting the OpenAI API key

Making false claims about fixes

Never testing on live site

Providing wrong commit information

Breaking working features

DOING SHALLOW AUDITS instead of comprehensive user testing

Don't be another failed agent. Follow this protocol exactly.

Are you ready to proceed with this protocol? Confirm you understand before starting.

