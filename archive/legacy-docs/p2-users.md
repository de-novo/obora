# TodoApp - Primary Users and Contexts

**Date:** 2026-03-15
**Artifact Type:** User Definition
**Status:** Final
**Based on:** Problem Definition (p1-problem.md)

---

## Primary User Personas

### Persona 1: Alex - The Knowledge Worker

**Demographics:**
- Age: 28-40
- Occupation: Software Developer, Product Manager, or Consultant
- Tech Savvy: High

**Characteristics:**
- Manages 20-30 concurrent tasks across multiple projects
- Uses multiple tools (email, Slack, Jira, calendar) daily
- Values efficiency and integration
- Needs to context-switch rapidly throughout the day

**Goals:**
- Never drop a commitment or deadline
- Quickly prioritize tasks based on urgency and importance
- Capture tasks instantly without friction
- See progress across all projects in one view

**Frustrations:**
- Tasks scattered across too many tools
- Time wasted deciding what to work on next
- Forgetting follow-up items from meetings
- Lack of visibility into long-term project progress

**Contexts of Use:**
| Context | Frequency | Environment | Primary Need |
|---------|-----------|-------------|--------------|
| Daily standup | Daily | Office/Remote | Quick task status review |
| Meeting capture | 3-5x/week | Conference room/Zoom | Instant task capture |
| Deep work sessions | Daily | Desk/Focused space | Prioritization and focus |
| Weekly planning | Weekly | Quiet time | Project-level view |

---

### Persona 2: Maria - The Busy Professional & Parent

**Demographics:**
- Age: 32-45
- Occupation: Marketing Manager, Teacher, or Healthcare Professional
- Tech Savvy: Medium

**Characteristics:**
- Balances work responsibilities with family/personal life
- Manages recurring household tasks (bills, appointments, shopping)
- Needs visibility across work and personal domains
- Prefers simple, intuitive interfaces

**Goals:**
- Never miss family appointments or work deadlines
- Reduce mental load of remembering everything
- Feel accomplished at end of day
- Maintain work-life balance

**Frustrations:**
- Feeling overwhelmed by competing priorities
- Forgetting personal commitments due to work stress
- Inability to see progress across different life areas
- Complex apps that require too much time to maintain

**Contexts of Use:**
| Context | Frequency | Environment | Primary Need |
|---------|-----------|-------------|--------------|
| Morning routine | Daily | Home/Commute | Quick overview of day |
| Work planning | Daily | Office | Task prioritization |
| Family coordination | 2-3x/week | Home | Shared task tracking |
| Errand management | Weekly | On-the-go | Location-based reminders |

---

### Persona 3: Jordan - The Student

**Demographics:**
- Age: 18-25
- Occupation: University Student or Recent Graduate
- Tech Savvy: High

**Characteristics:**
- Managing academic deadlines, extracurriculars, and job applications
- Limited budget (cost-sensitive)
- Values mobile-first experience
- Needs motivation and progress tracking

**Goals:**
- Never miss assignment deadlines
- Track progress toward semester goals
- Build productive habits
- Stay motivated during stressful periods

**Frustrations:**
- Procrastination from feeling overwhelmed
- Forgetting assignment due dates
- Lack of progress visualization
- Tools that feel like "more work to maintain"

**Contexts of Use:**
| Context | Frequency | Environment | Primary Need |
|---------|-----------|-------------|--------------|
| Class capture | 3-5x/week | Campus | Quick note/task entry |
| Study sessions | Daily | Library/Home | Focus on specific tasks |
| Weekly review | Weekly | Dorm/Apartment | Semester progress view |
| Exam preparation | 2-4x/semester | Intensive study | Deadline prioritization |

---

## User Context Matrix

| Use Context | Primary Persona | Secondary Persona | Key Requirement |
|-------------|-----------------|------------------|-----------------|
| Quick task capture | Alex | Maria | < 5 second entry |
| Daily prioritization | Alex | Jordan | Urgency/importance sorting |
| Progress review | Jordan | Alex | Visual progress indicators |
| Cross-project view | Alex | Maria | Filterable task lists |
| Recurring tasks | Maria | Jordan | Automated task renewal |
| Mobile usage | Jordan | Maria | Fully functional mobile app |

---

## User Prioritization

| Priority | Persona | Rationale |
|----------|---------|-----------|
| **P0** | Alex (Knowledge Worker) | Highest task volume, most severe fragmentation problem |
| **P0** | Maria (Busy Professional) | Strong need for work-life balance, broad market appeal |
| **P1** | Jordan (Student) | Growth segment, high mobile usage, motivation needs |

**Definition:**
- **P0 (Must-have):** Core features must address these users' primary pain points
- **P1 (Should-have):** Features important for these users but not MVP-critical

---

## Anti-Personas (Who We Are NOT Building For)

| Anti-Persona | Why Not In Scope |
|--------------|------------------|
| Enterprise Project Managers | Need Gantt charts, resource allocation, team dependencies |
| Agile/Scrum Masters | Need sprint planning, story points, velocity tracking |
| Collaborative Teams | Need real-time collaboration, task assignment, commenting |
| Heavy GTD Practitioners | Need complex contexts, waiting-for lists, extensive tagging |

---

**Next Steps:**
- Validate personas with user interviews
- Define user stories based on persona goals
- Establish metrics for user engagement and success
