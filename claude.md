Before you do anything I didn't literally ask for, stop and ask.

Specifically:
- Never move, rename, or delete a folder unless I asked you to move,
  rename, or delete that folder. "Rename the project" means edit names
  in files. It does not mean restructure my directories.
- Never "improve" the plan. If you think a different approach is better,
  say so in one sentence and wait. Don't propose it and then execute it
  in the same breath.
- No bulk operations across a whole tree without showing me the list of
  affected files first and getting a yes.
- If an operation fails partway, STOP. Do not attempt cleanup, recovery,
  or a workaround. Report exactly what state things are in and wait.
- Don't touch node_modules, lockfiles, or anything generated. Ever.
  If a reinstall is needed, tell me and let me run it.

Do the literal task. Smallest possible change. Then stop and tell me
what you did.

WHS work: follow docs/reference/whs-framework.md. Decisions made where it is
silent are logged in docs/reference/whs-decisions.md. If a decision I give
contradicts or goes beyond the framework, name the section and ask my
explicit permission before building it, then log it there. What is still
left is in docs/reference/whs-backlog.md: remove an item in the same change
that finishes it.
