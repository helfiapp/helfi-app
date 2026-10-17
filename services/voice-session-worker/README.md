# Voice worker deployment

Only the primary Helfi agent runs the AWS apply step, after the coordinated release checks. Preparing these files does not deploy them, invoke a model, run a voice session or prove that voice works on a phone.

Fixed target: account `437045580994`, Sydney `ap-southeast-2`, CLI profile `helfi-agent`.

| Resource | Configuration |
| --- | --- |
| `helfi-voice-session-worker` | Node.js22, `index.handler`, 256MB, 600-second maximum |
| `helfi-voice-session-watchdog` | Same ZIP/runtime/handler, 256MB, 30-second maximum |
| `helfi-voice-watchdog` | SQS-managed encryption, 180-second visibility, one-day retention, batch1 |
| `helfi-voice-watchdog-dlq` | SQS-managed encryption, 14-day retention; failed messages move here after3 receives |

Both functions use the same reviewed `index.mjs` and pinned `ws@8.22.0`. The monitor has zero Lambda asynchronous retries and a60-second maximum queued age. The independent watchdog queue handles cleanup retries. Each function has a precreated log group with14-day retention.

## Prepare an exact artifact

First commit the reviewed service source. Use the full40-character commit, never an inferred current working copy. The script reads only committed `index.mjs`, `package.json` and `package-lock.json`.

```bash
node services/voice-session-worker/deploy-aws.mjs --plan
node services/voice-session-worker/deploy-aws.mjs --prepare --commit FROZEN_40_CHARACTER_COMMIT
```

`--plan` is entirely offline. `--prepare` uses `npm ci --ignore-scripts --omit=dev --omit=optional` in a fresh temporary directory **outside the checkout**. It downloads only the pinned worker package and does not modify the app's lockfile or create repository `node_modules`. The supplied commit must already contain the reviewed source. No AWS calls happen in prepare mode.

Preparation/apply/verification also run the existing local-key guard. If that guard refuses, stop; do not bypass it or export a provider key to run this tool.

Preparation prints an outside-checkout manifest path and ZIP SHA256. The ZIP contains committed sources, pinned dependency and a provenance file; it contains no environment files, provider keys, authentication tokens, deploy script or account settings. Keep the manifest and ZIP together for the release evidence. Nothing is uploaded merely by preparing it.

## Primary agent: apply and read back

After checking the scoped Linear release ticket and exact artifact, supply all identities explicitly:

```bash
node services/voice-session-worker/deploy-aws.mjs --apply \
  --artifact /ABSOLUTE/TEMP/PATH/deployment-manifest.json \
  --commit FROZEN_40_CHARACTER_COMMIT \
  --zip-sha256 REVIEWED_64_CHARACTER_ZIP_SHA256 \
  --confirm-account 437045580994
```

`--apply` is the only mode that changes AWS. It first checks STS account identity and the committed source/ZIP hashes. It then creates or updates only the named functions, two dedicated service roles, log groups, queue/DLQ, the batch1 mapping and one narrowly scoped additional policy on the existing `helfi-amplify-backend-role`. It does not deploy Amplify, change any live environment settings, migrate a database, invoke either function or open a provider connection.

The tool stops on unexpected extra execution-role permissions, changed trust, environment variables on either function, multiple queue mappings or unexpected asynchronous destinations. It does not remove existing unrelated permissions or substitute a broad role. AWS mutations are not a transaction: if a later permission is denied, earlier named resources may already exist. Read the precise failed action, repair only that permission and rerun the same reviewed artifact. Do not report successful deployment from a partial apply.

Run the same command with `--verify` instead of `--apply` for a read-only check. Verification compares deployed `CodeSha256` with the exact ZIP, source tags, runtime/handler/role/memory/timeouts, empty environment-variable names, log retention, queue encryption/retention/redrive settings, exact role policies and enabled batch1 event mapping. Successful infrastructure readback does **not** prove callback availability, database migration, real billing, successful speech or phone behavior. The primary agent must verify the app release and authorized end-to-end behavior separately.

## Exact permissions

The deployment identity needs these actions, limited to the named resources wherever AWS supports resource restrictions:

- STS `GetCallerIdentity`.
- IAM `ListRoles` (list operation uses `*`), `CreateRole` for only `/service-role/helfi-voice-session-worker-role` and `/service-role/helfi-voice-session-watchdog-role`; `ListRolePolicies`, `GetRolePolicy`, `ListAttachedRolePolicies` and `PutRolePolicy` for those two roles; `GetRolePolicy`/`PutRolePolicy` for only the added `HelfiVoiceSessionDispatch` policy on existing `helfi-amplify-backend-role`. IAM role-policy actions target the exact role ARN; the policy document itself contains only the resources below.
- IAM `PassRole` for only the two dedicated role ARNs, conditioned on `iam:PassedToService = lambda.amazonaws.com`. `GetRole` is deliberately **not** called; the current identity may be allowed to list roles while that action is denied. No new IAM resource is assumed to exist or assumed authorized.
- Lambda create/update/get/tag/list-tags and asynchronous invoke-configuration actions for only the two named functions; create/update/get/list event-source mappings for the named watchdog function and exact queue, subject to AWS's supported IAM resource/condition types.
- SQS create/get-url/get-attributes/set-attributes for only the named main queue and DLQ. The deploy tool never reads messages or their scoped tokens.
- CloudWatch Logs describe groups, create the two exact function log groups and set their retention. Describe/list permissions may require `*`; runtime policies do not.

If AWS returns `AccessDenied`, the script reports the specific failing action and stops. Creating the role may or may not be allowed by the currently configured identity. It never requests blanket IAM access or works around a denial using another role.

For the observed `iam:CreateRole` denial, the precise two resource identities are:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CreateOnlyTwoVoiceServiceRoles",
      "Effect": "Allow",
      "Action": "iam:CreateRole",
      "Resource": [
        "arn:aws:iam::437045580994:role/service-role/helfi-voice-session-worker-role",
        "arn:aws:iam::437045580994:role/service-role/helfi-voice-session-watchdog-role"
      ]
    },
    {
      "Sid": "ConfigureOnlyThoseVoiceExecutionPolicies",
      "Effect": "Allow",
      "Action": [
        "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
        "iam:GetRolePolicy", "iam:PutRolePolicy"
      ],
      "Resource": [
        "arn:aws:iam::437045580994:role/service-role/helfi-voice-session-worker-role",
        "arn:aws:iam::437045580994:role/service-role/helfi-voice-session-watchdog-role"
      ]
    },
    {
      "Sid": "PassOnlyThoseRolesToLambda",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::437045580994:role/service-role/helfi-voice-session-worker-role",
        "arn:aws:iam::437045580994:role/service-role/helfi-voice-session-watchdog-role"
      ],
      "Condition": { "StringEquals": { "iam:PassedToService": "lambda.amazonaws.com" } }
    }
  ]
}
```

This is a prepared **scoped permission addition**, not a claim that it has been granted. Existing allowed actions remain separate. `ListRoles` and the exact existing Amplify role's `GetRolePolicy`/`PutRolePolicy` must also be available as listed above; use its actual ARN returned by `ListRoles`, without guessing its role path. The script only installs the documented fixed policy on that role. An organization permission boundary, service-control policy or explicit deny cannot be overridden by adding an allow; the account administrator must resolve that exact restriction. No alternate credentials or role are selected by this tool.

Runtime permissions are smaller:

- Worker role: `logs:CreateLogStream` and `logs:PutLogEvents` only in its own `/aws/lambda/helfi-voice-session-worker` log group.
- Watchdog role: the same two actions only in its own log group, plus `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes` only on `arn:aws:sqs:ap-southeast-2:437045580994:helfi-voice-watchdog`.
- Added Amplify role policy: `lambda:InvokeFunction` only on `arn:aws:lambda:ap-southeast-2:437045580994:function:helfi-voice-session-worker`, and `sqs:SendMessage` only on that main queue. Existing unrelated Amplify policies are preserved.

No provider key or authentication secret is put in function environment variables, ZIP files, queue messages or logs. A queue job carries only a short-lived, session-scoped control token and non-secret routing fields. The function obtains the provider credential from the authenticated app callback for RAM-only use. This tool never reads or copies that key. Queue tokens remain sensitive: do not print, inspect or paste message bodies.

## Limits and operational follow-up

The app/worker enforce funded holds, deadlines, request counts, leases and result verification. The watchdog is independent of the phone and main worker, and must reschedule itself when it observes a healthy lease. Unknown provider/backend usage keeps its financial hold; it must not be represented as zero or refunded from a guess. The declared `$0.05` per-session service allocation is a conservative policy basis, **not a measured AWS invoice**.

SQS, Lambda, networking, IAM or app outages can delay cleanup. Three failed receives move a message to the DLQ, which requires operational attention. No alarm, automatic DLQ repair, reserved-concurrency setting, unlimited availability promise or absolute profit guarantee is created by this script. Monitor the exact queue/DLQ/function failures and complete real invoice reconciliation separately. Never silently broaden permissions, replay uncertain app writes or start paid tests to check infrastructure without the owner's existing task authorization.
