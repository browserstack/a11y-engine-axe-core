---
name: stack:start-feature
description: Create a feature branch and optionally a Jira ticket for new work.
argument-hint: '<feature-description>'
---

# Start Feature

## Steps

1. **Branch from main:**

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feat/<short-kebab-description>
   ```

2. **Jira ticket (if Atlassian MCP available):**
   - Project: A11Y
   - Issue type: Story or Task
   - Title: concise feature description
   - Include affected packages in description
   - Link to relevant WCAG criteria if applicable

3. **Branch naming:**
   - Feature: `feat/<description>`
   - Bugfix: `fix/<description>`
   - If Jira ticket created: `feat/<JIRA-KEY>-<description>`

4. **Report:** branch name and Jira URL (if created).
