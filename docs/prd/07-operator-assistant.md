# 07. Operator assistant

Depends on: 01, 02. Grows with 03 to 06, since each one adds actions the assistant can plan.

## Summary

Add an assistant panel to the operator portal. An operator describes what happened in their own words, like "Acme renewed for five more years at $3,500 with 3% bumps". The assistant looks up the property's data, asks follow-up questions until it's sure what changed, and states back what it understood. Then it produces a change plan. That's an ordered list of steps. Each step opens the right form with the values filled in, and the person reviews and saves it there.

The assistant never writes data. Every change still goes through the normal form, with its usual permission checks, validation, and catch-up prompts.

## Problem

- One real-world event often needs several changes in different places. A renewal can mean a new end date, new rent steps, a new CAM estimate with a catch-up for months already charged, new options, and an uploaded extension. Nothing tells the operator which changes are needed or in what order.
- The right path depends on details people don't think to mention. Was it an option or a new deal? Is the tenant moving suites? Has the paperwork been signed? Choosing wrong is expensive. For example, a new lease when it should have been a renewal splits the ledger and the reconciliation year.
- The rules for effective dates, catch-ups, and year locks (02, 04, 06) are correct but hard to remember. Staff who touch leases a few times a year have to relearn them each time.
- When the product goes to other operators, those people won't have the owner around to ask.

## Goals

- An operator can describe a lease event in plain language and get a correct plan without knowing which screens are involved.
- The assistant asks before guessing. It never proposes a plan while a choice that changes the plan is still open.
- Every value in a plan is either something the operator said, something read from the property's data, or something the system calculated. The assistant doesn't do arithmetic on money itself.
- Following a plan takes no more clicks than doing the changes by hand, and usually fewer, because the forms come pre-filled.

## Non-goals

- The assistant saving changes itself. The design leaves room for this later (see "Later: applying plans").
- Reading uploaded documents. That's the AI pre-fill idea in 03, a separate PRD.
- Answering questions outside the portal: legal advice, tax advice, or general real estate questions. The assistant says it can't help and stops.
- Analytics answers like "which tenant paid late most often". Reads in v1 support planning, not reporting.
- Voice input, email or SMS access, or a tenant-facing assistant.

## Users and permissions

Staff and admins can do everything in this PRD (see Permissions in the README).

The assistant reads with the asking person's property scope. It can't see anything that person couldn't open themselves.

Each person sees only their own conversations on the property.

## Glossary

- **Conversation.** One thread between a person and the assistant on one property.
- **Understanding.** The assistant's restatement of what happened, as a short list of facts. The person confirms or corrects it before any plan appears.
- **Change plan.** An ordered list of steps that carries out the understanding. Saved, so it can be resumed.
- **Step.** One action from the action catalog, with a target (a lease, a tenant), proposed input, and a status.
- **Action catalog.** The list of changes the assistant may propose. Each entry matches one existing form.

## User stories

- As an operator, I type "Acme is renewing" and the assistant asks whether they're using an option, what the new rent is, and whether the extension is signed, then gives me a plan I can click through.
- As an operator, I say "Bella Nail Spa is moving from 104 to 110 in March" and the assistant explains that this is a new lease, not a renewal, and plans the end, the new lease, and the balance transfer.
- As an operator, I ask "how do I record a refund of a security deposit?" and get the steps with a link, without a plan.
- As an operator, I close the panel halfway through a plan and pick it up the next day where I left off.

## Where it lives

- 07 adds a page header to the portal. Its "Ask" button opens a side panel on any page. The keyboard shortcut is Cmd+J (Ctrl+J on Windows).
- The panel knows the current page. Opened from a lease, it starts with "About Acme Hardware, Suite 104?" so the person doesn't have to name the lease.
- The panel has two tabs. Chat holds the current conversation. History lists past conversations and open plans.
- There's no sidebar item. The assistant helps with every screen, so it belongs in the header rather than in LEASING or FINANCE.

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
 Build the change plan, check every step
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

Corrections loop back to the questions. The plan appears only after "That's right". This is the step that catches misunderstandings, so it isn't skippable. If the person corrects something after confirming, they have to confirm the new understanding before a plan appears.

### The change plan

The plan is a card in the chat, saved to the History tab.

```text
Plan: Acme Hardware renewal                         0 of 4 done

1. Renew lease (option)                             [ Open ]
   End date Dec 31, 2025 -> Dec 31, 2030. 5 rent steps from $3,500.

2. Change CAM estimate                              [ Open ]
   $268.61 -> $300.00 from Jan 1, 2026. Jan 2026 not charged yet,
   so no catch-up.

3. Upload signed extension                          [ Open ]
   Mark it as the document for this renewal. Until then the lease
   shows "Document missing".

4. Set options after renewal                        [ Open ]
   1 of 2 options used. Nothing to change unless the deal added options.
   [ Skip ]
```

- Each step names the action, the proposed values, and anything the person should know before saving, like a catch-up amount or a flag the step will set.
- Values on the card come from the system, not the assistant. The system checks the step and calculates previews like catch-up totals and rent steps from "Fill from pattern" the same way the forms do. The assistant's chat text can explain, but the card holds the numbers.
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

Each step's "Open" button goes to that action's form, with the step's values filled in.

- A banner says "Filled in from your plan. Check each field before saving." Fields the assistant filled get a small marker. Fields the person changes lose it.
- If the target changed after the plan was made (someone edited the lease), the form still loads current data and shows the plan's values side by side where they differ. The person chooses.
- Saving the form marks the step done in the same save. A save only completes a step when it's the form that step points to, on the same property.
- If the person leaves without saving, the step stays open.

## Action catalog

The catalog is the list of things the assistant can put in a plan. Each action matches one existing form.

- A step's values follow the same rules as the form. A plan step can't hold values the form wouldn't accept.
- Before a step goes on a plan, the system checks it the way the form would check it on save, without saving anything. When the check fails, the assistant fixes the values or asks the person a question.
- Some actions also show calculated facts on the plan card, like the catch-up table or the new monthly total.
- Each action lists the decision points from the table above, so the assistant knows what to check before using it.
- The assistant never plans a step whose screen isn't shipped yet.

v1 actions come from 01 to 03.

| Action | From |
|---|---|
| Edit a unit, edit a cost pool, create a category | 01 |
| Create a tenant, edit a tenant, add a tenant contact | 02 |
| Create a lease, edit lease basics, add rent steps, change an estimate, change a flat charge, set options, renew a lease, attach a renewal document, end a lease, cancel a lease | 02 |
| Upload a document, replace a document | 03 |

04, 05, and 06 add their own actions as part of their scope: manual charges and credits, recording payments, matching deposits, refunds, reopening a reconciliation. The README's principles gain a rule that every new way to change data ships with its catalog entry.

## What the assistant can look up

The assistant only reads. The only things it saves are its own records: the questions, the understanding, and the plan.

It can look up:

- Tenants by display name, legal name, or bank alias, with their leases.
- A lease's basics, terms with history, current monthly breakdown, options, and renewals.
- Leases by status, unit, or end date range.
- A lease's balance, charged months, and recent ledger entries (after 04).
- A lease's documents with type and dates (after 03).
- The catch-up table for a change (02, 04).
- Rent steps from "Fill from pattern", calculated the same way the form does it.
- Whether a year is reconciled and locked (after 06).
- Short help articles about portal concepts.

Help articles are short and written for operators. They're kept up to date with the portal. They're not these PRDs.

## Plan lifecycle

```text
 draft --(understanding confirmed, plan saved)--> open --(every step done or skipped)--> complete
                                                    |
                                                    +--(person closes it)--> abandoned
```

- A plan with no step done in 30 days shows as stale in History. It can still be opened.
- Before showing an open plan, and before opening a step's form, the system checks the remaining steps again. A step that no longer passes is marked "Out of date", with the reason, like "the lease already ends Dec 31, 2030". This includes a step whose form rules changed after the plan was saved, so the form never fills with values it would reject. The person can ask the assistant to update the plan, which starts a new turn in the same conversation.
- Each plan keeps the confirmed understanding as it was shown, each step's skip reason, and who completed each step and when.

## Limits

Each person has a daily message limit on each property.

## Safety

- **No writes.** The assistant can't change business data. The worst outcome of a bad answer is a wrong plan, and a person reviews every value in the form before it saves.
- **Untrusted text.** Tenant names, memos, bank descriptions, and document titles can contain text that looks like instructions. The assistant treats that text as data, never as instructions. The no-writes rule limits the damage if that fails.
- **Scope.** The assistant always reads the property the person has selected. Nothing it reads can make it look at another property.
- **Audit.** Conversations, the lookups the assistant made, and plans are kept. Each completed step links to the change its form saved, so the terms history can show "via plan: Acme Hardware renewal".

## Screen states

- **Panel, first open.** A short line on what the assistant does, plus three example prompts based on the current page. On a lease, one is "This tenant is renewing".
- **Thinking.** Each lookup shows as a quiet line, like "Looking up Acme Hardware's lease". The raw results aren't shown.
- **Assistant unavailable.** "The assistant isn't available right now." The rest of the portal works as normal, and open plans and pre-filled forms still work.
- **Daily limit reached.** Says so, and says when it resets.

## Edge cases

- **Person asks the assistant to "just do it".** It explains that it prepares plans and the person saves each form. The design is ready to change this later.
- **Feature not shipped yet.** A request that needs 04's manual charge before 04 ships gets an explanation that the portal can't record it yet, not a plan with a missing screen.
- **Two plans touch the same lease.** Allowed. Steps are checked again when opened, so the second one shows "Out of date" if the first already made its change.
- **Person edits a form far from the plan's values.** The save goes through, and the step is done. The plan records what was saved, not what was proposed.
- **Wrong property selected.** The person describes a tenant that isn't on this property. The assistant says it can't find them here and suggests switching property. It doesn't search other properties.
- **Locked year.** The assistant doesn't plan changes into a reconciled year. It explains 06's options (categorize to a non-recoverable category, carry to next year, or reopen the year) and plans whichever one the person picks.
- **Long conversation drifts to a new topic.** The assistant offers to start a new conversation so the plan and its understanding stay about one event.

## Quality checks

The assistant's answers can't be checked the same way as the rest of the portal, so this PRD adds a set of scenarios to check it against.

- Each scenario has sample property data, a scripted conversation (the person's messages and answers), and expected results: which questions must be asked, which facts the understanding must contain, and which steps the plan must have, in order, with which key values.
- The renewal table above becomes the first set of scenarios. Add scenarios for unit moves, early termination, an estimate change in a charged month, and a locked year.
- The scenarios run before any change to the assistant's model or instructions.
- A change ships only if every scenario that passed before still passes.

## Later: applying plans

v1 keeps a person in every form. If that proves slow for simple plans, a later PRD can add "Apply" on a step. The pieces are already in place:

- Step values already follow the form's rules.
- Each step is already checked the way the form would check it, without saving.
- Each completed step already links to the change it saved.

"Apply" would save the change the same way the form does, after the person confirms the step's preview on the card. Steps with catch-ups or year locks would likely stay form-only.

## Acceptance criteria

1. Starting from "Acme is renewing" on a lease with options left, the assistant asks about kind, new end date, rent, and the signed document before showing any plan.
2. No plan is created without a confirmed understanding. A correction after confirming requires confirming again.
3. Every renewal scenario in the table above produces the listed steps in the scenario checks.
4. Every amount on a plan card matches what the form shows when opened from that step.
5. Opening a step fills the form and shows the banner. Saving marks the step done. Leaving without saving doesn't.
6. A step whose target changed after planning shows "Out of date" or the side-by-side values, and never saves the stale values silently.
7. The assistant can't read data from another property, even if a tenant name or memo in this property asks it to.
8. With the assistant unavailable, open plans, pre-filled forms, and the rest of the portal keep working.

## Open questions

1. **Model choice.** Which AI model to start with. Switching later is cheap, so pick by how well each one does on the scenario checks.
2. **Conversation retention.** Keep conversations forever for audit, or delete them after a set time and keep only plans and their understanding?
3. **Cost.** Who pays for model usage once other operators use the product? This affects the daily limit and whether the assistant is a paid feature.
