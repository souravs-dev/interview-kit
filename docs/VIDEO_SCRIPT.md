# Walkthrough video script (~3-4 minutes)

Suggested screen recording tool: QuickTime (Cmd+Shift+5 on Mac), Loom, or OBS.

## 1. Intro (20s)

> "This is the AI Interview Prep Kit — you paste a job description, a company URL, and how many
> days until your interview, and it researches the company, generates a categorised question
> bank and flashcards, checks coverage against the job requirements, and builds a day-by-day study
> schedule. Everything's editable afterward without losing your edits when you regenerate a
> section — that was the hardest state problem in the build."

Show: the live URL in the address bar (https://interview-kit-phi.vercel.app), login page.

## 2. Create a kit (40s)

- Log in (or register a new account on camera).
- Paste a real job description (have one ready — e.g. a public backend engineer posting) and a
  real company URL.
- Set days until interview (e.g. 5).
- Click "Generate prep kit".
- While it's generating (~60-120s with a live LLM — **consider having a kit pre-generated in
  another tab to cut to, to avoid dead air**), narrate:

> "This kicks off an async job — crawling the company's site (ranking links itself, no hardcoded
> path list), searching for public discussion of their interview process, extracting requirements
> from the JD deterministically, then generating questions through separate LLM calls per
> category — technical, behavioural, system design, company fit — not one big prompt."

## 3. Show the generated kit (45s)

- Company brief section.
- Requirements list (must vs nice-to-have).
- Question categories — click into one, show a couple of questions with answer outlines.
- Flashcards.
- Schedule — show it's day-by-day, must-haves front-loaded.
- Coverage indicator (all green, or note an honest gap if one exists).

## 4. The Builder — the flagship feature (60s)

> "Here's the part I want to highlight — the non-destructive regeneration."

- Edit one question's text by hand.
- Pin it.
- Click "Regenerate" on that same category.
- Wait for it to finish.
- Show: the hand-edited, pinned question is still there, untouched, alongside new
  freshly-generated ones.

> "Every item carries a small `_meta` block — source, pinned, order — and the merge rule is just:
> keep it if it's not still in its original generated state, or if it's pinned. Everything else
> gets replaced. That's what makes regenerate safe to hit without losing work."

## 5. Practice mode (25s)

- Navigate to Practice.
- Reveal a flashcard, rate confidence.
- Show the queue re-order by least-confident-first after a couple of ratings.

## 6. The batch CLI (30s)

Switch to a terminal (pre-open one, cd into the repo):

```bash
npm run evaluate -- --input cases.json --output kits.json
```

> "This is the mandatory batch entry point — it runs the exact same pipeline code as the web app,
> not a parallel implementation. Given a JSON file of job description + company pairs, it writes
> back structured kits, and continues past any individual case that fails rather than aborting
> the whole run."

Show the output file briefly (`cat kits.json | head` or open in an editor).

## 7. Wrap-up (20s)

> "Tech stack: Next.js and Tailwind on the frontend, Express and MongoDB on the backend, deployed
> on Vercel and Render's free tiers. LLM is Google Gemini after an Anthropic credits issue mid-build
> — the pipeline was built adapter-first, so that was a same-day switch. Full details, architecture
> diagram, and known limitations are in the README."

---

**Tips while recording:**
- Close unrelated tabs/notifications before starting.
- If the backend has been idle, hit the live URL once ~1 minute before recording to wake Render's
  free-tier instance (avoids a 30-50s cold-start dead spot on camera).
- It's fine to cut between "clicked generate" and "here's the result" rather than watching the
  full generation live — call that out verbally ("I'll skip ahead while this generates").
