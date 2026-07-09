const cache = {
  projects: { data: null, timestamp: null, ttl: 5 * 60 * 1000 },
  sessions: new Map(),

  getProjects() {
    if (this.projects.data && this.isValid(this.projects.timestamp, this.projects.ttl)) {
      return this.projects.data;
    }
    return null;
  },

  setProjects(data) {
    this.projects.data = data;
    this.projects.timestamp = Date.now();
  },

  getSession(sessionId) {
    const entry = this.sessions.get(sessionId);
    if (entry && this.isValid(entry.timestamp, 10 * 60 * 1000)) {
      return entry.data;
    }
    // Evict expired entry so the Map doesn't grow unbounded
    if (entry) this.sessions.delete(sessionId);
    return null;
  },

  setSession(sessionId, data) {
    // Sweep expired entries so write-only sessions can't grow the Map forever
    const now = Date.now();
    for (const [id, entry] of this.sessions) {
      if (now - entry.timestamp >= 10 * 60 * 1000) this.sessions.delete(id);
    }
    this.sessions.set(sessionId, { data, timestamp: now });
  },

  isValid(timestamp, ttl) {
    return timestamp && (Date.now() - timestamp) < ttl;
  },

  clear() {
    this.projects.data = null;
    this.projects.timestamp = null;
    this.sessions.clear();
  },
};

export default cache;
