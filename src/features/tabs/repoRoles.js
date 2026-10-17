// Roles a tab's repo can be tagged with, for linking it into another prompt.
export const REPO_ROLES = [
  { value: 'ui', label: 'UI' },
  { value: 'api', label: 'Backend/API' },
  { value: 'db', label: 'Database' },
];

export const repoRoleLabel = (role) => REPO_ROLES.find((r) => r.value === role)?.label;
