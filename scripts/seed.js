const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../src/models/User');
const Agent = require('../src/models/Agent');
const Queue = require('../src/models/Queue');
const PhoneNumber = require('../src/models/PhoneNumber');
const { USER_ROLES, AGENT_STATUS, QUEUE_STRATEGY } = require('../src/utils/constants');

const seedData = {
  users: [
    {
      username: 'admin',
      email: 'admin@callcenter.com',
      password: 'admin123',
      role: USER_ROLES.ADMIN,
      profile: {
        firstName: 'System',
        lastName: 'Administrator',
        department: 'IT'
      }
    },
    {
      username: 'supervisor1',
      email: 'supervisor@callcenter.com',
      password: 'super123',
      role: USER_ROLES.SUPERVISOR,
      profile: {
        firstName: 'John',
        lastName: 'Supervisor',
        department: 'Customer Service'
      }
    },
    {
      username: 'agent1',
      email: 'agent1@callcenter.com',
      password: 'agent123',
      role: USER_ROLES.AGENT,
      profile: {
        firstName: 'Jane',
        lastName: 'Smith',
        department: 'Customer Service',
        skills: ['customer_service', 'technical_support']
      }
    },
    {
      username: 'agent2',
      email: 'agent2@callcenter.com',
      password: 'agent123',
      role: USER_ROLES.AGENT,
      profile: {
        firstName: 'Mike',
        lastName: 'Johnson',
        department: 'Sales',
        skills: ['sales', 'upselling', "customer_service"]
      }
    }
  ],

  queues: [
    {
      queueId: 'support-queue',
      name: 'Customer Support',
      description: 'General customer support queue',
      strategy: QUEUE_STRATEGY.SKILLS_BASED,
      configuration: {
        maxWaitTime: 300,
        maxQueueSize: 50,
        skillsRequired: ['customer_service']
      },
      agents: [
        {
          agentId: '686fe6c279fee1ae5d66e1fd',
          weight: 1,
          addedAt: new Date()
        }
      ]
    },
    {
      queueId: 'sales-queue',
      name: 'Sales',
      description: 'Sales and new customer queue',
      strategy: QUEUE_STRATEGY.ROUND_ROBIN,
      configuration: {
        maxWaitTime: 180,
        maxQueueSize: 30,
        skillsRequired: ['sales']
      }
    },
    {
      queueId: 'technical-queue',
      name: 'Technical Support',
      description: 'Technical support and troubleshooting',
      strategy: QUEUE_STRATEGY.SKILLS_BASED,
      configuration: {
        maxWaitTime: 600,
        maxQueueSize: 25,
        skillsRequired: ['technical_support']
      }
    }
  ]
};

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Agent.deleteMany({}),
      Queue.deleteMany({}),
      PhoneNumber.deleteMany({})
    ]);
    console.log('Cleared existing data');

    // Create users
    const createdUsers = [];
    for (const userData of seedData.users) {
      const hashedPassword = await bcrypt.hash(userData.password, 12);
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      await user.save();
      createdUsers.push(user);
      console.log(`Created user: ${user.username}`);
    }

    // Create agents for agent users
    const agentUsers = createdUsers.filter(user => user.role === USER_ROLES.AGENT);
    for (const user of agentUsers) {
      const agent = new Agent({
        userId: user._id,
        agentId: `AGENT_${user._id.toString().slice(-6).toUpperCase()}`,
        status: AGENT_STATUS.OFFLINE,
        skills: user.profile.skills?.map(skill => ({
          skill,
          level: Math.floor(Math.random() * 3) + 3 // Random level 3-5
        })) || [],
        capacity: {
          maxConcurrentCalls: 1,
          currentCalls: 0
        },
        performance: {
          totalCalls: Math.floor(Math.random() * 100),
          totalTalkTime: Math.floor(Math.random() * 50000),
          satisfactionScore: Math.random() * 2 + 3 // 3-5 rating
        }
      });
      await agent.save();
      console.log(`Created agent: ${agent.agentId}`);
    }

    // Create queues
    for (const queueData of seedData.queues) {
      const queue = new Queue(queueData);
      await queue.save();
      console.log(`Created queue: ${queue.name}`);
    }

    console.log('Database seeded successfully!');
    process.exit(0);

  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };