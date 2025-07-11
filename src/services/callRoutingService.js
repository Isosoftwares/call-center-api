const Agent = require('../models/Agent');
const Queue = require('../models/Queue');
const { AGENT_STATUS, QUEUE_STRATEGY } = require('../utils/constants');
const { curry, pipe } = require('../utils/helpers');

// Functional routing strategies
const roundRobinRouting = curry(async (agents, call) => {
  // Simple round-robin: get agent with least recent assignment
  return agents.sort((a, b) => 
    (a.lastAssigned || 0) - (b.lastAssigned || 0)
  )[0];
});

const skillsBasedRouting = curry(async (agents, call) => {
  const requiredSkills = call.requiredSkills || [];
  
  if (!requiredSkills.length) {
    return roundRobinRouting(agents, call);
  }

  // Filter agents by required skills
  const qualifiedAgents = agents.filter(agent => 
    requiredSkills.every(skill => 
      agent.skills.some(agentSkill => 
        agentSkill.skill === skill && agentSkill.level >= 3
      )
    )
  );

  if (!qualifiedAgents.length) {
    return roundRobinRouting(agents, call);
  }

  // Sort by skill level (highest first)
  return qualifiedAgents.sort((a, b) => {
    const aSkillSum = a.skills.reduce((sum, skill) => sum + skill.level, 0);
    const bSkillSum = b.skills.reduce((sum, skill) => sum + skill.level, 0);
    return bSkillSum - aSkillSum;
  })[0];
});

const weightedRouting = curry(async (agents, call) => {
  // Weight based on performance and availability
  const weightedAgents = agents.map(agent => ({
    ...agent,
    weight: calculateAgentWeight(agent)
  }));

  return weightedAgents.sort((a, b) => b.weight - a.weight)[0];
});

const priorityRouting = curry(async (agents, call) => {
  const callPriority = call.callerInfo?.priority || 0;
  
  if (callPriority >= 8) {
    // High priority: get best available agent
    return weightedRouting(agents, call);
  } else if (callPriority >= 5) {
    // Medium priority: skills-based routing
    return skillsBasedRouting(agents, call);
  } else {
    // Low priority: round-robin
    return roundRobinRouting(agents, call);
  }
});

// Helper function to calculate agent weight
const calculateAgentWeight = (agent) => {
  const baseWeight = 100;
  const performanceBonus = (agent.performance?.satisfactionScore || 0) * 10;
  const capacityPenalty = agent.capacity.currentCalls * 20;
  
  return baseWeight + performanceBonus - capacityPenalty;
};

// Get available agents
const getAvailableAgents = async (queueId) => {
  const queue = await Queue.findOne({ queueId });
  
  if (!queue) {
    throw new Error('Queue not found');
  }

  const availableAgents = [];

  console.log(queue.agents)
  
  for (const queueAgent of queue.agents) {
    const agent = await Agent.findById(queueAgent.agentId)
      .populate('userId', 'profile');
    
    if (agent ) {
      availableAgents.push({
        ...agent.toObject(),
        queueWeight: queueAgent.weight,
        lastAssigned: agent.lastAssigned || 0
      });
    }
  }

  console.log(`Available agents for queue ${queueId}:`, availableAgents.length);

  return availableAgents;
};

// Main routing function
const routeCall = async (call, queueId = 'support-queue') => {
  try {
    const availableAgents = await getAvailableAgents(queueId);
    
    if (!availableAgents.length) {
      return { success: false, reason: 'No available agents' };
    }

    const queue = await Queue.findOne({ queueId });
    const strategy = queue?.strategy || QUEUE_STRATEGY.ROUND_ROBIN;

    // Route based on strategy
    let selectedAgent;
    switch (strategy) {
      case QUEUE_STRATEGY.SKILLS_BASED:
        selectedAgent = await skillsBasedRouting(availableAgents, call);
        break;
      case QUEUE_STRATEGY.WEIGHTED:
        selectedAgent = await weightedRouting(availableAgents, call);
        break;
      case QUEUE_STRATEGY.PRIORITY:
        selectedAgent = await priorityRouting(availableAgents, call);
        break;
      default:
        selectedAgent = await roundRobinRouting(availableAgents, call);
    }

    if (selectedAgent) {
      // Update agent status
      await Agent.findByIdAndUpdate(selectedAgent._id, {
        $inc: { 'capacity.currentCalls': 1 },
        $set: { lastAssigned: Date.now() }
      });

      return {
        success: true,
        agent: selectedAgent,
        strategy: strategy
      };
    }

    return { success: false, reason: 'No suitable agent found' };

  } catch (error) {
    console.error('Call routing error:', error);
    return { success: false, reason: error.message };
  }
};

module.exports = {
  routeCall,
  getAvailableAgents,
  roundRobinRouting,
  skillsBasedRouting,
  weightedRouting,
  priorityRouting
};