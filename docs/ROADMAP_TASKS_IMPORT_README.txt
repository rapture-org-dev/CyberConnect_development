ROADMAP_TASKS_IMPORT.csv — how to import into the Tasks sheet
================================================================================

File: docs/ROADMAP_TASKS_IMPORT.csv
Rows: 38 tickets in work order — Part A (Priority 1–11) then Part G (Jira parity waves)

WHAT IS INCLUDED
  - Only work NOT yet in the product (Implemented in product = No).
  - Shipped items (EN/JA column labels, header align, column drag resize) are omitted.

IMPORT STEPS
  1. Open your project → Tasks tab → Batch Import.
  2. Upload ROADMAP_TASKS_IMPORT.csv (UTF-8).
  3. Map columns:
       Code          → Code / task_code
       Phase         → Phase
       Sprint        → Sprint  (priority order hint: 01, 02, …)
       Epic          → Epic
       Medium        → Medium
       Task          → Task
       エピック      → Epic (JA) / epic_ja
       中項目        → Medium (JA) / medium_item_ja
       タスク        → Task (JA) / task_ja
       Status        → Status
       P/Day         → P/Day / person_day
       Remark        → Remark
     Optional (map to Remark if no custom columns):
       Roadmap Part, Priority, Feature ID, Depends on, Implemented in product
  4. Preview → resolve duplicates if you re-import (codes TSK-RMP-001 … 038).
  5. Finalize import.

WORK ORDER
  Sort/filter by Sprint or Priority column after import.
  Respect Depends on (e.g. sprint DB before Kanban).

REFERENCE
  Full specs: docs/FUTURE_FEATURES_ROADMAP.txt (Part A, Part D, Part G).
