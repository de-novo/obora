# TodoApp - Jobs-to-Be-Done (JTBD) Statements

**Date:** 2026-03-15
**Artifact Type:** JTBD Definition
**Status:** Final
**Based on:** Problem Definition (p1-problem.md) and User Definition (p2-users.md)

---

## JTBD Framework Overview

Each JTBD statement follows the structure:
- **When** [situation/context]
- **I want to** [motivation/action]
- **So that** [expected outcome/value]

---

## JTBD Statement 1: Unified Task Management

**When** I'm juggling 20-30 concurrent tasks across work projects, personal commitments, and household responsibilities throughout a chaotic day,

**I want to** capture, organize, and prioritize all my tasks in one unified view without switching between multiple apps or tools,

**So that** I can maintain complete visibility of all my commitments, make confident prioritization decisions, and never drop a deadline or forget a commitment again.

---

### JTBD 1 Analysis

| Dimension | Description |
|-----------|-------------|
| **Primary Persona** | Alex (Knowledge Worker) - P0 |
| **Secondary Persona** | Maria (Busy Professional) - P0 |
| **Problem Addressed** | Problem 1: Task Fragmentation and Lost Productivity |
| **Context Frequency** | Daily (multiple times per day) |
| **Emotional State** | Overwhelmed → In control |
| **Success Metric** | < 5 seconds to capture any task; 100% of tasks visible in single view |
| **Key Jobs** | - Capture task instantly<br>- Categorize by context (work/personal/project)<br>- Prioritize by urgency/importance<br>- View all tasks across domains |

---

## JTBD Statement 2: Progress Recognition and Motivation

**When** I've been working on multiple tasks all day but feel like I haven't accomplished anything meaningful,

**I want to** see a clear, visual representation of what I've completed today and this week compared to my commitments,

**So that** I can recognize my productivity, feel motivated to continue making progress, and maintain accountability for my goals.

---

### JTBD 2 Analysis

| Dimension | Description |
|-----------|-------------|
| **Primary Persona** | Jordan (Student) - P1 |
| **Secondary Persona** | Alex (Knowledge Worker) - P0 |
| **Problem Addressed** | Problem 2: Lack of Progress Visibility and Motivation |
| **Context Frequency** | Daily (end of day) and Weekly (review) |
| **Emotional State** | Unproductive/unmotivated → Accomplished/empowered |
| **Success Metric** | Users report increased motivation scores; completion visualization viewed at least 3x/week |
| **Key Jobs** | - View completed tasks summary<br>- See progress toward goals<br>- Track productivity patterns<br>- Get visual reinforcement of accomplishments |

---

## JTBD Statement 3: Cross-Domain Coordination

**When** I'm trying to balance my professional deadlines with family responsibilities and personal errands without letting any domain suffer,

**I want to** seamlessly switch between work, family, and personal task views while maintaining visibility of urgent items across all domains,

**So that** I can meet my work commitments, never miss family appointments or personal obligations, and maintain a healthy work-life balance.

---

### JTBD 3 Analysis

| Dimension | Description |
|-----------|-------------|
| **Primary Persona** | Maria (Busy Professional & Parent) - P0 |
| **Secondary Persona** | Alex (Knowledge Worker) - P0 |
| **Problem Addressed** | Problem 1: Task Fragmentation and Lost Productivity |
| **Context Frequency** | Daily (morning routine, work planning, family coordination) |
| **Emotional State** | Stressed/anxious → Balanced/confident |
| **Success Metric** | Zero missed personal appointments; reduced self-reported stress levels |
| **Key Jobs** | - View tasks by domain (work/family/personal)<br>- Set domain-specific reminders<br>- See cross-domain urgent items<br>- Maintain separation with integrated visibility |

---

## JTBD to Persona Mapping

| JTBD | Alex | Maria | Jordan |
|------|------|-------|--------|
| **1. Unified Task Management** | Primary | Secondary | Tertiary |
| **2. Progress Recognition** | Secondary | Tertiary | Primary |
| **3. Cross-Domain Coordination** | Secondary | Primary | Tertiary |

---

## JTBD to Problem Mapping

| JTBD | Problem 1 (Task Fragmentation) | Problem 2 (Progress Visibility) |
|------|--------------------------------|----------------------------------|
| **1. Unified Task Management** | ✓ (Primary) | - |
| **2. Progress Recognition** | - | ✓ (Primary) |
| **3. Cross-Domain Coordination** | ✓ (Primary) | ✓ (Secondary) |

---

## Prioritization Insights

### MVP Scope (JTBD 1 - Unified Task Management)
- **Rationale:** Addresses the highest-severity problem for P0 personas
- **Must-have features:** Quick capture, categorization, unified view, prioritization
- **Success criteria:** Sub-5-second capture, 100% task visibility

### Post-MVP Enhancement (JTBD 2 - Progress Recognition)
- **Rationale:** Solves retention and engagement problem
- **Should-have features:** Completion tracking, visual progress, productivity analytics
- **Success criteria:** Daily progress view usage, increased task completion rates

### Post-MVP Enhancement (JTBD 3 - Cross-Domain Coordination)
- **Rationale:** Expands market to work-life balance segment
- **Should-have features:** Domain filtering, cross-domain alerts, recurring tasks
- **Success criteria:** Multi-domain users report reduced stress, zero missed appointments

---

## Competitive Differentiation by JTBD

| Competitor Category | JTBD 1 | JTBD 2 | JTBD 3 |
|---------------------|--------|--------|--------|
| **Basic Note Apps** | ✗ Limited view | ✗ No progress | ✗ No domains |
| **Complex PM Tools** | ✓ Overkill for individuals | ✓ Team-focused | ✓ Not personal |
| **Simple Todo Lists** | ✓ Basic view | ✗ No motivation | ✗ No domains |
| **TodoApp (Our Solution)** | ✓ Fast + Unified | ✓ Visual progress | ✓ Cross-domain |

---

**Next Steps:**
- Validate JTBD statements through user interviews
- Derive user stories from each JTBD's key jobs
- Define acceptance criteria based on success metrics
- Map features to JTBD priorities for roadmap planning
