# 07. Operator assistant

Depends on: 01, 02. Grows with 03 to 06, since each one adds actions the assistant can plan.

## Summary

Add an assistant panel to the operator portal. An admin or staff member describes what happened in their own words, like "Acme renewed for five more years at $3,500 with 3% bumps". The assistant looks up the property's data, asks follow-up questions until it's sure what changed, and states back what it understood. Then it produces a change plan. That's an ordered list of steps. Each step opens the right form with the values filled in, and the person reviews and saves it there.

The assistant never writes data. Every change still goes through the normal form, with its usual permission checks, validation, and catch-up prompts.

## Problem

- One real-world event often needs several changes in different places. A renewal can mean a new end date, new rent steps, a new CAM estimate with a catch-up for months already charged, new options, and an uploaded extension. Nothing tells the operator which changes are needed or in what order.
- The right path depends on details people don't think to mention. Was it an option or a new deal? Is the tenant moving suites? Has the paperwork been signed? Choosing wrong is expensive. For example, a new lease when it should have been a renewal splits the ledger and the reconciliation year.
- The rules for effective dates, catch-ups, and year locks (02, 04, 06) are correct but hard to remember. Staff who touch leases a few times a year have to relearn them each time.
- When the product goes to other operators, those people won't have the owner around to ask.

## Goals

- An operator can describe a lease event in plain language and get a correct plan without knowing which screens are involved.
- The assistant asks before guessing. It never proposes a plan while a choice that changes the plan is still open.
- Every value in a plan is either something the operator said, something read from the property's data, or something the system calculated. The model doesn't do arithmetic on money.
- Following a plan takes no more clicks than doing the changes by hand, and usually fewer, because the forms come pre-filled.
- Staff can prepare a plan that includes admin-only steps and hand it to an admin.

## Non-goals

- The assistant saving changes itself. The design leaves room for this later (see "Later: applying plans").
- Reading uploaded documents. That's the AI pre-fill idea in 03, a separate PRD.
- Answering questions outside the portal: legal advice, tax advice, or general real estate questions. The assistant says it can't help and stops.
- Analytics answers like "which tenant paid late most often". Reads in v1 support planning, not reporting.
- Voice input, email or SMS access, or a tenant-facing assistant.

## Users and permissions

| Action | Staff | Admin |
|---|---|---|
| Ask questions and get plans | yes | yes |
| Open and complete steps they're allowed to do | yes | yes |
| See and complete admin-only steps | sees, can't complete | yes |
| Send a plan to an admin | yes | not needed |
| See plans sent to admins | own only | all on the property |

The assistant reads with the asking person's permissions and property scope. It can't see anything that person couldn't open themselves.

## Glossary

- **Conversation.** One thread between a person and the assistant on one property.
- **Understanding.** The assistant's restatement of what happened, as a short list of facts. The person confirms or corrects it before any plan appears.
- **Change plan.** An ordered list of steps that carries out the understanding. Saved, so it can be resumed, shared, or handed off.
- **Step.** One action from the action catalog, with a target (a lease, a tenant), proposed input, and a status.
- **Action catalog.** The list of changes the assistant may propose. Each entry maps to one existing form and one existing tRPC mutation.

## User stories

- As an admin, I type "Acme is renewing" and the assistant asks whether they're using an option, what the new rent is, and whether the extension is signed, then gives me a plan I can click through.
- As an admin, I say "Bella Nail Spa is moving from 104 to 110 in March" and the assistant explains that this is a new lease, not a renewal, and plans the end, the new lease, and the balance transfer.
- As a staff member, I describe a CAM increase the owner agreed to. The plan has admin-only steps, so I send it to an admin with a note.
- As an admin, I open the dashboard, see a plan a staff member sent me, and work through it.
- As an operator, I ask "how do I record a refund of a security deposit?" and get the steps with a link, without a plan.
- As an operator, I close the panel halfway through a plan and pick it up the next day where I left off.

## Where it lives

- An "Ask" button in the portal header opens a side panel on any page. The keyboard shortcut is Cmd+J (Ctrl+J on Windows).
- The panel knows the current page. Opened from a lease, it starts with "About Acme Hardware, Suite 104?" so the person doesn't have to name the lease.
- The panel has two tabs. Chat holds the current conversation. History lists past conversations and open plans.
- There's no sidebar item. The assistant helps with every screen, so it belongs in the header rather than in LEASING or FINANCE.
- The dashboard (01) gets a card, "Plans waiting for an admin", visible to admins.

## Conversation flow

```text
 Person describes an event
          |
          v
 Assistant looks up data  <---------------------------+
 (tenants, leases, terms, ledger, documents)          |
          |                                           |
          v                                           |
 Anything that changes the plan still open? --yes--> Ask (1 to 3 questions,
          | no                                       with choices when possible)
          v
 State the understanding --- person corrects ---------+
          | person confirms
          v
 Build the change plan, validate every step on the server
          |
          v
 Plan card: steps with "Open" buttons
```

### Asking questions

The assistant asks when a missing or ambiguous fact would change which steps appear or what goes in them. It doesn't ask about things it can look up, and it doesn't ask about things that don't matter to the plan.

- Questions come in small batches of one to three, never a long form.
- When there's a known set of answers (option or negotiated, signed or not yet), the question renders as buttons with an "Other" choice. Free-text questions are for amounts, dates, and names.
- When data and the person disagree, the assistant says so. "The lease I have ends Dec 31, 2025, not 2026. Which is right?" It doesn't quietly pick one.
- When a name matches more than one record, it lists the matches with unit and dates and asks which one.

Common decision points, which the action catalog also lists so the assistant knows to check them:

| Situation | What the assistant needs to know |
|---|---|
| Lease continues past its end date | Same unit and same tenant entity? Option or negotiated? New end date? Rent for the new term? Signed document yet? |
| Any amount change | Effective date. If it falls in a charged month, post the catch-up now or later (02) |
| Tenant moves units | Move date. What happens to the old lease's balance |
| Tenant entity changes (assignment) | Effective date. Whether the old tenant stays liable (a note only, the system doesn't model guarantors) |
| Lease ends early | End date. Whether to refund or apply the security deposit |
| Change in a reconciled year (06) | The year is locked, so the assistant explains the options from 06 instead of planning a direct change |

### Stating the understanding

Before any plan, the assistant restates the facts as a short list and asks the person to confirm.

```text
Here's what I understood:
- Acme Hardware (Suite 104) is exercising its first extension option.
- The lease now ends Dec 31, 2030.
- Rent starts at $3,500 on Jan 1, 2026 and goes up 3% each Jan 1.
- CAM estimate goes from $268.61 to $300.00 starting Jan 1, 2026.
- The signed extension isn't back yet.

[ That's right ]  [ Change something ]
```

Corrections loop back to the questions. The plan appears only after "That's right". This is the step that catches misunderstandings, so it isn't skippable.

### The change plan

The plan is a card in the chat, saved to the History tab.

```text
Plan: Acme Hardware renewal                         0 of 4 done

1. Renew lease (option)                 Admin       [ Open ]
   End date Dec 31, 2025 -> Dec 31, 2030. 5 rent steps from $3,500.

2. Change CAM estimate                  Admin       [ Open ]
   $268.61 -> $300.00 from Jan 1, 2026. Jan 2026 not charged yet,
   so no catch-up.

3. Upload signed extension              Staff ok    [ Open ]
   Mark it as the document for this renewal. Until then the lease
   shows "Document missing".

4. Set options after renewal            Admin       [ Open ]
   1 of 2 options used. Nothing to change unless the deal added options.
   [ Skip ]
```

- Each step names the action, who can do it, the proposed values, and anything the person should know before saving, like a catch-up amount or a flag the step will set.
- Values on the card come from the server. The server validates the step and calculates previews like catch-up totals and rent steps from "Fill from pattern" with the same domain functions the forms use. The model's chat text can explain, but the card holds the numbers.
- Steps have an order. A step that depends on an earlier one, like a catch-up that needs the renewal saved first, shows "After step 1" until that's done.
- Any step can be skipped, with an optional reason.
- "Open" goes to the form for that action with the values filled in (see "Pre-filled forms").
- After the person saves the form, the step turns done and the card shows the next one.

### Questions that don't need a plan

"How do I..." questions get a short answer with links to the right screens. If the answer depends on the property's data ("why is Acme's balance $55.92?"), the assistant looks it up and explains with the ledger lines it read. It offers a plan only if the person wants to change something.

## Example: renewals

One sentence, "Acme is renewing", can lead to quite different plans. The assistant's questions decide which one.

| What the questions reveal | Plan |
|---|---|
| Option, same terms pattern, extension signed | Renew lease (option) with the document attached. Done in one step |
| Option, extension not signed yet | Renew lease (option). Upload extension later, and the plan stays open on that step |
| Negotiated, new rent plus a CAM change effective in a month already charged | Renew lease (negotiated). Change CAM estimate, showing the catch-up table and its total. Upload amendment. Set new options if granted |
| Renewing, but moving to Suite 110 | End lease on 104. Create lease on 110. Move the balance with a credit and a charge (04). Upload the new lease |
| Renewing, but under a new company name after a sale of the business | Explain this is an assignment. End the lease and create a new one for the new tenant, or edit the tenant's legal name if the operator confirms it's the same entity with a new name |
| Lease ended last month and nobody renewed in time | Explain that ended leases can't be renewed (02). Plan a new lease starting the day after the old end date, and point out the gap in charges if any months passed |
| Lease is month to month | Renew lease. The new term starts the day after the old end date. The step shows the catch-up for months already charged at the old rent |

## Pre-filled forms

Form routes accept a `planStep` search parameter, for example `/leases/{id}/renew?planStep={stepId}`.

- The form loads the step's input with `assistant.planStep` and fills its fields.
- A banner says "Filled in from your plan. Check each field before saving." Fields the assistant filled get a small marker. Fields the person changes lose it.
- If the target changed after the plan was made (someone edited the lease), the form still loads current data and shows the plan's values side by side where they differ. The person chooses.
- Saving sends `planStepId` with the mutation. After the mutation succeeds, the API layer marks the step done in the same request. The domain contexts don't know plans exist.
- If the person leaves without saving, the step stays open.

## Action catalog

The catalog is the list of things the assistant can put in a plan. It lives in `packages/api/operator/src/assistant/catalog`, one file per action.

Each entry has:

- `name`, like `lease.renew`.
- `inputSchema`, the same Zod schema the tRPC mutation uses. A plan step can't hold input the form wouldn't accept.
- `route`, a function from the step's target and id to the form URL.
- `requiresAdmin`, matching the mutation's procedure.
- `description` and `whenToUse`, written for the model, including the decision points from the table above.
- `validate(ctx, input)`, a dry run. It loads the aggregate, runs the same command method the mutation would, and throws away the result. Errors go back to the model so it can fix the input or ask a question.
- `preview(ctx, input)`, optional. It returns the server-calculated facts shown on the plan card, like the catch-up table or the new monthly total.
- `availableWhen`, which PRD or feature the action needs, so the assistant never plans a step whose screen isn't shipped yet.

v1 actions come from 01 to 03.

| Action | From |
|---|---|
| `unit.update`, `pool.update`, `category.create` | 01 |
| `tenant.create`, `tenant.update`, `tenant.addContact` | 02 |
| `lease.create`, `lease.updateBasics`, `lease.addRentSteps`, `lease.changeEstimate`, `lease.changeFlatCharge`, `lease.setOptions`, `lease.renew`, `lease.attachRenewalDocument`, `lease.end` | 02 |
| `document.upload`, `document.replace` | 03 |

04, 05, and 06 add their own actions as part of their scope: manual charges and credits, recording payments, matching deposits, refunds, reopening a reconciliation. The README's principles gain a rule that a new user-facing write ships with its catalog entry.

## Tools the model can call

All tools run on the server with the asking person's request context. All of them are read-only, except for writing the assistant's own records (questions, understanding, plan).

| Tool | Returns |
|---|---|
| `findTenants(query)` | Matches by display name, legal name, or bank alias, with their leases |
| `getLease(leaseId)` | Basics, terms with history, current monthly breakdown, options, renewals |
| `listLeases(filter)` | Leases by status, unit, or end date range |
| `getLedgerSummary(leaseId)` | Balance, charged months, recent entries (after 04) |
| `listDocuments(leaseId)` | Documents with type and dates (after 03) |
| `previewCatchUp(leaseId, change)` | The catch-up table from 02 and 04 |
| `fillFromPattern(start, increase, every, until)` | Rent steps, from the same function the form uses |
| `getYearStatus(year)` | Whether a year is reconciled and locked (after 06) |
| `searchHelp(query)` | Short help articles about portal concepts |
| `askQuestions(questions)` | Renders questions with choices. Ends the model's turn |
| `stateUnderstanding(facts)` | Renders the confirmation card. Ends the model's turn |
| `proposePlan(title, steps)` | Validates every step with the catalog. On success, saves and renders the plan. On failure, returns the errors to the model |

`proposePlan` is rejected if the conversation has no confirmed understanding, or if the confirmed understanding came before the person's latest correction.

Help articles live as Markdown in `packages/api/operator/src/assistant/help`. They're short, written for operators, and kept in the repo so they change with the code. They're not these PRDs.

## Who can do what in a plan

- Every step shows "Admin" or "Staff ok" from the catalog's `requiresAdmin`.
- A staff member sees admin steps with their values, but the "Open" button reads "Needs an admin".
- If a plan has any admin steps, staff get "Send to an admin" with an optional note. The plan shows up on the admin dashboard card and in every admin's History tab under "Sent to admins".
- An admin who opens a sent plan sees the conversation that produced it, read-only, so they know what was said.
- Staff can still do the "Staff ok" steps in a sent plan, like uploading the document.

## Plan lifecycle

```text
 draft --(understanding confirmed, plan saved)--> open --(every step done or skipped)--> complete
                                                    |
                                                    +--(person closes it)--> abandoned
```

- A plan with no step done in 30 days shows as stale in History, and the dashboard card drops it. It can still be opened.
- Before showing an open plan, the server runs `validate` on its remaining steps. A step that no longer validates is marked "Out of date", with the reason, like "the lease already ends Dec 31, 2030". The person can ask the assistant to update the plan, which starts a new turn in the same conversation.

## Domain and architecture

The assistant isn't a business context. It owns no business rules, only conversations and plans. It lives in the API layer and talks to contexts through the same application services and queries the routers use.

```text
 Operator portal
   Assistant panel  --stream-->  /api/assistant (route handler)
   Forms ?planStep=                   |
        |                             v
        |                     packages/api/operator/src/assistant
        |                       model loop, tools, action catalog
        |                             |               |
        v                             v               v
   tRPC mutations  <--- same Zod ---  catalog     read queries in each
   (+ planStepId)        schemas      validate()  context (property-scoped)
        |
        v
   assistant schema: conversations, messages, plans, plan_steps
```

- **Model access.** Use the Vercel AI SDK (`ai`) through the Vercel AI Gateway. The gateway lets the model and provider change without code changes. A new `packages/infrastructure/llm` package wraps it and reads its config from environment variables.
- **Streaming.** A Next.js route handler at `apps/operator-portal/src/app/api/assistant/route.ts` streams responses. It builds the same request context as tRPC (session, property, role) and rejects requests without one. tRPC handles the non-streaming calls: history, plans, `planStep`, send to admin.
- **System prompt.** Built per request from the catalog's descriptions and decision points, the person's role, the current page, and today's date. It's versioned in code. Each saved message records the prompt version.
- **Limits.** Each turn has at most 10 tool calls. Each person has a daily message cap per property, set by config. Conversations over a size limit get older tool results summarized.

## Safety

- **No writes.** The model has no tool that changes business data. The worst outcome of a bad answer is a wrong plan, and a person reviews every value in the form before it saves.
- **Untrusted text.** Tenant names, memos, bank descriptions, and document titles can contain text that looks like instructions. Tool results mark them as data, and the system prompt tells the model to treat them that way. The no-writes rule limits the damage if that fails.
- **Scope.** Tools take no `propertyId` argument. They read it from the request context, so the model can't ask for another property's data.
- **Audit.** Conversations, tool calls, and plans are stored. Each completed step links to the domain event its mutation emitted, so the terms history can show "via plan: Acme Hardware renewal".

## API

| Procedure | Kind | Notes |
|---|---|---|
| `POST /api/assistant` | route handler | Streams one turn. Input conversation id (optional), message, current page |
| `assistant.conversations` | query | The person's conversations on this property |
| `assistant.conversation` | query | Messages and plan. Admins can read conversations behind plans sent to them |
| `assistant.plans` | query | Filter by status and "sent to admins" |
| `assistant.planStep` | query | Step input and target for pre-filling a form. Re-validates first |
| `assistant.skipStep` | mutation | Optional reason |
| `assistant.sendToAdmin` | mutation | Optional note |
| `assistant.abandonPlan` | mutation | |
| `assistant.plansWaitingForAdmin` | query | For the dashboard card |

Every mutation in the action catalog accepts an optional `planStepId`. The router marks the step done after the command succeeds, only if the step belongs to this property and has the same action name.

## Data model

```text
assistant.conversations
  id              uuid pk
  property_id     uuid not null
  auth_user_id    text not null
  title           varchar(255)
  created_at      timestamp not null default now()
  updated_at      timestamp not null default now()
  index (property_id, auth_user_id, updated_at)

assistant.messages
  id              uuid pk
  conversation_id uuid not null references conversations on delete cascade
  role            varchar(16) not null      -- 'user', 'assistant', 'tool'
  parts           jsonb not null            -- text, tool calls, tool results, question and answer cards
  prompt_version  varchar(32)
  created_at      timestamp not null default now()
  index (conversation_id, created_at)

assistant.plans
  id                    uuid pk
  property_id           uuid not null
  conversation_id       uuid not null references conversations
  title                 varchar(255) not null
  understanding         jsonb not null      -- confirmed facts, as shown
  status                varchar(16) not null  -- 'open', 'complete', 'abandoned'
  created_by            text not null
  sent_to_admin_at      timestamp
  sent_to_admin_note    text
  created_at            timestamp not null default now()
  closed_at             timestamp
  index (property_id, status)

assistant.plan_steps
  id              uuid pk
  plan_id         uuid not null references plans on delete cascade
  position        int not null
  action          varchar(64) not null
  target          jsonb not null            -- e.g. { "leaseId": "..." }
  input           jsonb not null            -- matches the action's inputSchema
  requires_admin  boolean not null
  depends_on      int[] not null default '{}'   -- positions of earlier steps
  status          varchar(16) not null default 'pending'  -- 'pending', 'done', 'skipped'
  skip_reason     text
  completed_by    text
  completed_at    timestamp
  event_id        uuid                      -- domain event from the completing mutation
  unique (plan_id, position)
```

`input` is validated against the action's current schema when the step is read, not only when it's written. A schema change after a plan is saved marks the step "Out of date" rather than filling a form with bad values.

## Screen states

- **Panel, first open.** A short line on what the assistant does, plus three example prompts based on the current page. On a lease, one is "This tenant is renewing".
- **Thinking.** Tool calls show as a quiet line, like "Looking up Acme Hardware's lease". Raw tool output isn't shown.
- **Gateway or model error.** "The assistant isn't available right now." The rest of the portal works as normal, and open plans and pre-filled forms still work.
- **Daily cap reached.** Says so, and says when it resets.
- **No permission for any step.** A staff member asking for something entirely admin-only gets the plan plus "Send to an admin" as the only action.

## Edge cases

- **Person asks the assistant to "just do it".** It explains that it prepares plans and the person saves each form. The design is ready to change this later.
- **Feature not shipped yet.** A request that needs 04's manual charge before 04 ships gets an explanation that the portal can't record it yet, not a plan with a missing screen.
- **Two plans touch the same lease.** Allowed. Steps re-validate when opened, so the second one shows "Out of date" if the first already made its change.
- **Person edits a form far from the plan's values.** The save goes through, and the step is done. The plan records what was saved through `event_id`, not what was proposed.
- **Wrong property selected.** The person describes a tenant that isn't on this property. The assistant says it can't find them here and suggests switching property. It doesn't search other properties.
- **Locked year.** The assistant doesn't plan changes into a reconciled year. It explains 06's options (categorize to a non-recoverable category, carry to next year, or reopen as an admin) and plans whichever one the person picks.
- **Long conversation drifts to a new topic.** The assistant offers to start a new conversation so the plan and its understanding stay about one event.
- **Plan sent to admin, then staff finds a mistake.** Staff can still add to the conversation. A new plan replaces the old one, and the old one is marked abandoned with a link to the new one.

## Quality checks

The model's behavior can't be unit tested like the domain, so this PRD adds a scenario suite in `packages/api/operator/src/assistant/evals`.

- Each scenario has fixture property data, a scripted conversation (the person's messages and answers), and expected results: which questions must be asked, which facts the understanding must contain, and which steps the plan must have, in order, with which key input values.
- The renewal table above becomes the first set of scenarios. Add scenarios for unit moves, early termination, an estimate change in a charged month, and a locked year.
- The suite runs against the configured model on demand and before changing the model or prompt version. It doesn't run in normal CI.
- A change ships only if every scenario that passed before still passes.

## Later: applying plans

v1 keeps a person in every form. If that proves slow for simple plans, a later PRD can add "Apply" on a step. The pieces are already in place:

- Step input already matches the mutation's schema.
- `validate` already dry-runs the command.
- `requiresAdmin` already matches the procedure.
- `planStepId` already links the step to the event it produced.

"Apply" would call the same mutation as the form, after the person confirms the step's preview on the card. Steps with catch-ups or year locks would likely stay form-only.

## Acceptance criteria

1. Starting from "Acme is renewing" on a lease with options left, the assistant asks about kind, new end date, rent, and the signed document before showing any plan.
2. No plan is created without a confirmed understanding. A correction after confirming requires confirming again.
3. Every renewal scenario in the table above produces the listed steps in the scenario suite.
4. Every amount on a plan card matches what the form shows when opened from that step.
5. Opening a step fills the form and shows the banner. Saving marks the step done. Leaving without saving doesn't.
6. A staff member can't complete an admin step, can send the plan to an admin, and the plan appears on the admin dashboard card.
7. A step whose target changed after planning shows "Out of date" or the side-by-side values, and never saves the stale values silently.
8. The assistant can't read data from another property, even if a tenant name or memo in this property asks it to.
9. With the model unavailable, open plans, pre-filled forms, and the rest of the portal keep working.

## Open questions

1. **Model choice.** Which model to start with. The gateway makes switching cheap, so pick by how well each one does on the scenario suite.
2. **Conversation retention.** Keep conversations forever for audit, or delete them after a set time and keep only plans and their understanding?
3. **Cost.** Who pays for model usage once other operators use the product? This affects the daily cap and whether the assistant is a paid feature.
