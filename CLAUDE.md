# Hackathon frontend — working agreement

## Design skills are mandatory, not optional

Any task that creates or changes UI — a page, a component, a layout, styling,
copy in the interface, an animation — must run through these two skills.
Do not skip them because a change "looks small".

1. **Before writing UI code**: invoke the `design-taste-frontend` skill.
   It decides the design direction from the brief. Follow its pre-flight check.
   Do not default to Inter + purple gradient + centered hero. That is the
   exact output it exists to prevent.

2. **After writing UI code**: invoke the `web-design-guidelines` skill and
   audit what you just wrote. Fix what it flags before reporting the work done.
   It fetches Vercel's live ruleset, so do not cache its findings between runs.

## Design direction

The chosen aesthetic lives in `DESIGN.md` in this folder. Read it at the start
of any UI task and treat its tokens as binding: typography scale, color ramp,
spacing, radius, motion. If a request conflicts with `DESIGN.md`, say so before
building, rather than silently diverging.

Reference library of alternative directions (35 files, 10 families):
`~/.claude/design-refs/awesome-claude-design/design-md/`

## Non-negotiables

- Accessibility is part of "done": real focus states, keyboard paths, contrast
  that passes, semantic elements over div soup.
- No placeholder lorem ipsum in anything demoed. Write real copy.
- Responsive from the first pass, not retrofitted.
