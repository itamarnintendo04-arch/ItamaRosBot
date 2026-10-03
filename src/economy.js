const { getDatabase } = require("./database");

function getCollection() {
  return getDatabase().collection("economy_users");
}

function getSettingsCollection() {
  return getDatabase().collection("economy_settings");
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

function xpForLevel(level) {
  if (level <= 1) {
    return 0;
  }

  return (level - 1) ** 2 * 100;
}

async function ensureAccount(guildId, userId) {
  const collection = getCollection();

  await collection.updateOne(
    {
      guildId,
      userId
    },
    {
      $setOnInsert: {
        guildId,
        userId,
        xp: 0,
        coins: 0,
        messageCount: 0,
        xpMessagesRequired: null,
        createdAt: Date.now()
      }
    },
    {
      upsert: true
    }
  );

  return collection.findOne({
    guildId,
    userId
  });
}

async function getAccount(guildId, userId) {
  return ensureAccount(guildId, userId);
}

async function getXpSettings(guildId) {
  const collection = getSettingsCollection();

  await collection.updateOne(
    {
      guildId
    },
    {
      $setOnInsert: {
        guildId,
        messagesForXp: 5,
        messageIncrease: 2,
        xpPerReward: 10,
        updatedAt: Date.now()
      }
    },
    {
      upsert: true
    }
  );

  return collection.findOne({
    guildId
  });
}

async function setXpSettings(
  guildId,
  {
    messagesForXp,
    messageIncrease,
    xpPerReward
  }
) {
  const collection = getSettingsCollection();

  const current = await getXpSettings(guildId);

  const newSettings = {
    messagesForXp:
      messagesForXp !== undefined
        ? Math.max(1, Math.floor(Number(messagesForXp)))
        : current.messagesForXp,

    messageIncrease:
      messageIncrease !== undefined
        ? Math.max(0, Math.floor(Number(messageIncrease)))
        : current.messageIncrease,

    xpPerReward:
      xpPerReward !== undefined
        ? Math.max(1, Math.floor(Number(xpPerReward)))
        : current.xpPerReward,

    updatedAt: Date.now()
  };

  await collection.updateOne(
    {
      guildId
    },
    {
      $set: newSettings
    },
    {
      upsert: true
    }
  );

  return getXpSettings(guildId);
}

async function processMessageXp(guildId, userId) {
  const collection = getCollection();

  await ensureAccount(guildId, userId);

  const settings = await getXpSettings(guildId);

  const account = await getAccount(guildId, userId);

  const currentRequired =
    account.xpMessagesRequired !== null &&
    account.xpMessagesRequired !== undefined
      ? account.xpMessagesRequired
      : settings.messagesForXp;

  const newMessageCount = account.messageCount + 1;

  if (newMessageCount < currentRequired) {
    await collection.updateOne(
      {
        guildId,
        userId
      },
      {
        $set: {
          messageCount: newMessageCount
        }
      }
    );

    return {
      rewarded: false,
      account: {
        ...account,
        messageCount: newMessageCount,
        xpMessagesRequired: currentRequired
      }
    };
  }

  const newXp = account.xp + settings.xpPerReward;

  const newRequired =
    currentRequired + settings.messageIncrease;

  await collection.updateOne(
    {
      guildId,
      userId
    },
    {
      $set: {
        xp: newXp,
        messageCount: 0,
        xpMessagesRequired: newRequired
      }
    }
  );

  const newLevel = levelFromXp(newXp);
  const oldLevel = levelFromXp(account.xp);

  return {
    rewarded: true,
    xpGained: settings.xpPerReward,
    levelUp: newLevel > oldLevel,
    oldLevel,
    newLevel,
    messagesRequired: newRequired,
    account: {
      ...account,
      xp: newXp,
      messageCount: 0,
      xpMessagesRequired: newRequired
    }
  };
}

async function addXp(guildId, userId, amount) {
  const safeAmount = Math.max(0, Math.floor(Number(amount)));

  if (!safeAmount) {
    return getAccount(guildId, userId);
  }

  const collection = getCollection();

  await ensureAccount(guildId, userId);

  await collection.updateOne(
    {
      guildId,
      userId
    },
    {
      $inc: {
        xp: safeAmount
      }
    }
  );

  return getAccount(guildId, userId);
}

async function removeXp(guildId, userId, amount) {
  const safeAmount = Math.max(0, Math.floor(Number(amount)));

  if (!safeAmount) {
    return getAccount(guildId, userId);
  }

  const collection = getCollection();

  await ensureAccount(guildId, userId);

  const account = await getAccount(guildId, userId);

  const newXp = Math.max(
    0,
    account.xp - safeAmount
  );

  await collection.updateOne(
    {
      guildId,
      userId
    },
    {
      $set: {
        xp: newXp
      }
    }
  );

  return getAccount(guildId, userId);
}

async function setXp(guildId, userId, amount) {
  const safeAmount = Math.max(0, Math.floor(Number(amount)));

  const collection = getCollection();

  await ensureAccount(guildId, userId);

  await collection.updateOne(
    {
      guildId,
      userId
    },
    {
      $set: {
        xp: safeAmount
      }
    }
  );

  return getAccount(guildId, userId);
}

async function addCoins(guildId, userId, amount) {
  const safeAmount = Math.floor(Number(amount));

  if (!Number.isFinite(safeAmount) || safeAmount === 0) {
    return getAccount(guildId, userId);
  }

  const collection = getCollection();

  await ensureAccount(guildId, userId);

  await collection.updateOne(
    {
      guildId,
      userId
    },
    {
      $inc: {
        coins: safeAmount
      }
    }
  );

  return getAccount(guildId, userId);
}

async function removeCoins(guildId, userId, amount) {
  const safeAmount = Math.max(0, Math.floor(Number(amount)));

  if (!safeAmount) {
    return getAccount(guildId, userId);
  }

  const collection = getCollection();

  await ensureAccount(guildId, userId);

  await collection.updateOne(
    {
      guildId,
      userId
    },
    {
      $inc: {
        coins: -safeAmount
      }
    }
  );

  return getAccount(guildId, userId);
}

async function setCoins(guildId, userId, amount) {
  const safeAmount = Math.floor(Number(amount));

  if (!Number.isFinite(safeAmount)) {
    return getAccount(guildId, userId);
  }

  const collection = getCollection();

  await ensureAccount(guildId, userId);

  await collection.updateOne(
    {
      guildId,
      userId
    },
    {
      $set: {
        coins: safeAmount
      }
    }
  );

  return getAccount(guildId, userId);
}

async function getLeaderboard(guildId, limit = 10) {
  const collection = getCollection();

  return collection
    .find({
      guildId
    })
    .sort({
      xp: -1
    })
    .limit(limit)
    .toArray();
}

module.exports = {
  levelFromXp,
  xpForLevel,

  ensureAccount,
  getAccount,

  getXpSettings,
  setXpSettings,
  processMessageXp,

  addXp,
  removeXp,
  setXp,

  addCoins,
  removeCoins,
  setCoins,

  getLeaderboard
};
