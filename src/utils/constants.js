const CALL_STATUS = {
  QUEUED: 'queued',
  RINGING: 'ringing',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  BUSY: 'busy',
  FAILED: 'failed',
  NO_ANSWER: 'no-answer',
  CANCELED: 'canceled'
};

const AGENT_STATUS = {
  AVAILABLE: 'available',
  BUSY: 'busy',
  BREAK: 'break',
  OFFLINE: 'offline'
};

const QUEUE_STRATEGY = {
  ROUND_ROBIN: 'round_robin',
  SKILLS_BASED: 'skills_based',
  WEIGHTED: 'weighted',
  PRIORITY: 'priority'
};

const USER_ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  AGENT: 'agent'
};

module.exports = {
  CALL_STATUS,
  AGENT_STATUS,
  QUEUE_STRATEGY,
  USER_ROLES
};