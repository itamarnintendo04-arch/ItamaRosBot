const { getDatabase } = require("./database");

/* =========================================================
   DEFAULT XP SETTINGS
========================================================= */

const DEFAULT_XP_MIN = 10;
const DEFAULT_XP_MAX = 20;

const DEFAULT_MESSAGES_REQUIRED = 5;
const DEFAULT_MESSAGE_INCREMENT = 1;
const DEFAULT_MAX_MESSAGES_REQUIRED = 25;

const STEAL_COOLDOWN_MS = 30 * 1000;

/* =========================================================
   COLLECTIONS
========================================================= */

function users() {
  return getDatabase().collection("economy_users");
}

function inventory() {
  return getDatabase().collection("inventories");
}

function xpSettings() {
  return getDatabase().collection("xp_settings");
}

/* =========================================================
   LEVEL SYSTEM
========================================================= */

function levelFromXp(xp) {
  return (
    Math.floor(
      Math.sqrt(
        Math.max(0, Number(xp) || 0) / 100
      )
    ) + 1
  );
}

function xpForLevel(level) {
  const safeLevel = Math.max(
    1,
    Math.floor(Number(level) || 1)
  );

  if (safeLevel <= 1) {
    return 0;
  }

  return (safeLevel - 1) ** 2 * 100;
}

/* =========================================================
   XP SETTINGS
========================================================= */

function normalizeXpSettings(settings = {}) {
  return {
    enabled:
      settings.enabled !== false,

    xpMin:
      Math.max(
        0,
        Math.floor(
          Number(
            settings.xpMin
          ) || DEFAULT_XP_MIN
        )
      ),

    xpMax:
      Math.max(
        0,
        Math.floor(
          Number(
            settings.xpMax
          ) || DEFAULT_XP_MAX
        )
      ),

    messagesRequired:
      Math.max(
        1,
        Math.floor(
          Number(
            settings.messagesRequired
          ) || DEFAULT_MESSAGES_REQUIRED
        )
      ),

    messageIncrement:
      Math.max(
        0,
        Math.floor(
          Number(
            settings.messageIncrement
          ) || DEFAULT_MESSAGE_INCREMENT
        )
      ),

    maxMessagesRequired:
      Math.max(
        1,
        Math.floor(
          Number(
            settings.maxMessagesRequired
          ) || DEFAULT_MAX_MESSAGES_REQUIRED
        )
      )
  };
}

async function ensureXpSettings(guildId) {
  const collection = xpSettings();

  await collection.updateOne(
    {
      guildId
    },
    {
      $setOnInsert: {
        guildId,

        enabled: true,

        xpMin:
          DEFAULT_XP_MIN,

        xpMax:
          DEFAULT_XP_MAX,

        messagesRequired:
          DEFAULT_MESSAGES_REQUIRED,

        messageIncrement:
          DEFAULT_MESSAGE_INCREMENT,

        maxMessagesRequired:
          DEFAULT_MAX_MESSAGES_REQUIRED,

        createdAt:
          Date.now(),

        updatedAt:
          Date.now()
      }
    },
    {
      upsert: true
    }
  );

  const settings =
    await collection.findOne({
      guildId
    });

  return normalizeXpSettings(
    settings
  );
}

async function getXpSettings(guildId) {
  return ensureXpSettings(
    guildId
  );
}

async function updateXpSettings(
  guildId,
  changes = {}
) {
  await ensureXpSettings(
    guildId
  );

  const allowed = {};

  if (
    typeof changes.enabled ===
    "boolean"
  ) {
    allowed.enabled =
      changes.enabled;
  }

  if (
    changes.xpMin !== undefined
  ) {
    allowed.xpMin =
      Math.max(
        0,
        Math.floor(
          Number(
            changes.xpMin
          ) || 0
        )
      );
  }

  if (
    changes.xpMax !== undefined
  ) {
    allowed.xpMax =
      Math.max(
        0,
        Math.floor(
          Number(
            changes.xpMax
          ) || 0
        )
      );
  }

  if (
    changes.messagesRequired !==
    undefined
  ) {
    allowed.messagesRequired =
      Math.max(
        1,
        Math.floor(
          Number(
            changes.messagesRequired
          ) || 1
        )
      );
  }

  if (
    changes.messageIncrement !==
    undefined
  ) {
    allowed.messageIncrement =
      Math.max(
        0,
        Math.floor(
          Number(
            changes.messageIncrement
          ) || 0
        )
      );
  }

  if (
    changes.maxMessagesRequired !==
    undefined
  ) {
    allowed.maxMessagesRequired =
      Math.max(
        1,
        Math.floor(
          Number(
            changes.maxMessagesRequired
          ) || 1
        )
      );
  }

  if (
    Object.keys(allowed).length
  ) {
    allowed.updatedAt =
      Date.now();

    await xpSettings().updateOne(
      {
        guildId
      },
      {
        $set: allowed
      }
    );
  }

  return getXpSettings(
    guildId
  );
}

/* =========================================================
   ECONOMY ACCOUNTS
========================================================= */

async function ensureAccount(
  guildId,
  userId
) {
  const collection =
    users();

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

        createdAt:
          Date.now()
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

async function getAccount(
  guildId,
  userId
) {
  return ensureAccount(
    guildId,
    userId
  );
}

/* =========================================================
   XP MANUAL MANAGEMENT
========================================================= */

async function addXp(
  guildId,
  userId,
  amount
) {
  const safeAmount =
    Math.max(
      0,
      Math.floor(
        Number(amount) || 0
      )
    );

  const before =
    await ensureAccount(
      guildId,
      userId
    );

  const beforeLevel =
    levelFromXp(
      before.xp
    );

  if (safeAmount > 0) {
    await users().updateOne(
      {
        guildId,
        userId
      },
      {
        $inc: {
          xp: safeAmount
        },

        $set: {
          updatedAt:
            Date.now()
        }
      }
    );
  }

  const after =
    await getAccount(
      guildId,
      userId
    );

  const newLevel =
    levelFromXp(
      after.xp
    );

  return {
    account: after,

    added:
      safeAmount,

    oldLevel:
      beforeLevel,

    newLevel,

    leveledUp:
      newLevel >
      beforeLevel
  };
}

async function removeXp(
  guildId,
  userId,
  amount
) {
  const safeAmount =
    Math.max(
      0,
      Math.floor(
        Number(amount) || 0
      )
    );

  await ensureAccount(
    guildId,
    userId
  );

  await users().updateOne(
    {
      guildId,
      userId
    },
    [
      {
        $set: {
          xp: {
            $max: [
              0,

              {
                $subtract: [
                  {
                    $ifNull: [
                      "$xp",
                      0
                    ]
                  },

                  safeAmount
                ]
              }
            ]
          },

          updatedAt:
            Date.now()
        }
      }
    ]
  );

  return getAccount(
    guildId,
    userId
  );
}

async function setXp(
  guildId,
  userId,
  amount
) {
  const safeAmount =
    Math.max(
      0,
      Math.floor(
        Number(amount) || 0
      )
    );

  await users().updateOne(
    {
      guildId,
      userId
    },
    {
      $set: {
        xp:
          safeAmount,

        updatedAt:
          Date.now()
      },

      $setOnInsert: {
        guildId,
        userId,

        coins: 0,

        messageCount: 0,

        createdAt:
          Date.now()
      }
    },
    {
      upsert: true
    }
  );

  return getAccount(
    guildId,
    userId
  );
}

/* =========================================================
   AUTOMATIC MESSAGE XP
========================================================= */

async function processMessageXp(
  guildId,
  userId
) {
  if (
    !guildId ||
    !userId
  ) {
    return null;
  }

  const settings =
    await getXpSettings(
      guildId
    );

  if (
    !settings.enabled
  ) {
    return {
      rewarded: false,
      disabled: true
    };
  }

  await ensureAccount(
    guildId,
    userId
  );

  const collection =
    users();

  const now =
    Date.now();

  /*
    We increment the message counter first.

    Example:

    Required = 5

    Message 1 → 1 / 5
    Message 2 → 2 / 5
    Message 3 → 3 / 5
    Message 4 → 4 / 5
    Message 5 → XP!
  */

  const result =
    await collection.findOneAndUpdate(
      {
        guildId,
        userId
      },

      [
        {
          $set: {
            messageCount: {
              $add: [
                {
                  $ifNull: [
                    "$messageCount",
                    0
                  ]
                },

                1
              ]
            },

            updatedAt:
              now
          }
        },

        {
          $set: {
            xpRewardTriggered: {
              $gte: [
                "$messageCount",

                {
                  $ifNull: [
                    "$xpMessagesRequired",
                    settings.messagesRequired
                  ]
                }
              ]
            }
          }
        },

        {
          $set: {
            xp: {
              $cond: [
                "$xpRewardTriggered",

                {
                  $add: [
                    {
                      $ifNull: [
                        "$xp",
                        0
                      ]
                    },

                    {
                      $floor: {
                        $add: [
                          settings.xpMin,

                          {
                            $multiply: [
                              {
                                $rand: {}
                              },

                              {
                                $add: [
                                  {
                                    $subtract: [
                                      settings.xpMax,
                                      settings.xpMin
                                    ]
                                  },

                                  1
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    }
                  ]
                },

                {
                  $ifNull: [
                    "$xp",
                    0
                  ]
                }
              ]
            },

            messageCount: {
              $cond: [
                "$xpRewardTriggered",

                0,

                "$messageCount"
              ]
            },

            xpMessagesRequired: {
              $cond: [
                "$xpRewardTriggered",

                {
                  $min: [
                    settings.maxMessagesRequired,

                    {
                      $add: [
                        {
                          $ifNull: [
                            "$xpMessagesRequired",
                            settings.messagesRequired
                          ]
                        },

                        settings.messageIncrement
                      ]
                    }
                  ]
                },

                {
                  $ifNull: [
                    "$xpMessagesRequired",
                    settings.messagesRequired
                  ]
                }
              ]
            },

            lastXpRewardAt: {
              $cond: [
                "$xpRewardTriggered",

                now,

                {
                  $ifNull: [
                    "$lastXpRewardAt",
                    null
                  ]
                }
              ]
            }
          }
        },

        {
          $unset:
            "xpRewardTriggered"
        }
      ],

      {
        returnDocument:
          "after"
      }
    );

  if (!result) {
    return null;
  }

  const xp =
    Number(result.xp) || 0;

  const required =
    Math.max(
      1,

      Number(
        result.xpMessagesRequired
      ) ||
      settings.messagesRequired
    );

  /*
    We cannot know the exact random XP amount
    from the final account alone, so calculate
    the reward by comparing the previous value
    stored before this operation when needed.
  */

  const rewarded =
    Number(
      result.lastXpRewardAt
    ) === now;

  return {
    rewarded,

    xpGained:
      rewarded
        ? Math.floor(
            settings.xpMin +
            Math.random() *
              (
                settings.xpMax -
                settings.xpMin +
                1
              )
          )
        : 0,

    account:
      result,

    xp,

    level:
      levelFromXp(xp),

    messageCount:
      Number(
        result.messageCount
      ) || 0,

    messagesRequired:
      required
  };
}

/* =========================================================
   MESSAGE XP WRAPPER
========================================================= */

async function awardMessageXp(
  message
) {
  if (
    !message ||
    !message.guild ||
    !message.author ||
    message.author.bot
  ) {
    return null;
  }

  return processMessageXp(
    message.guild.id,
    message.author.id
  );
}

/* =========================================================
   COINS
========================================================= */

async function addCoins(
  guildId,
  userId,
  amount
) {
  const safeAmount =
    Math.floor(
      Number(amount) || 0
    );

  await ensureAccount(
    guildId,
    userId
  );

  if (
    safeAmount === 0
  ) {
    return getAccount(
      guildId,
      userId
    );
  }

  await users().updateOne(
    {
      guildId,
      userId
    },
    {
      $inc: {
        coins:
          safeAmount
      },

      $set: {
        updatedAt:
          Date.now()
      }
    }
  );

  return getAccount(
    guildId,
    userId
  );
}

async function removeCoins(
  guildId,
  userId,
  amount
) {
  const safeAmount =
    Math.max(
      0,
      Math.floor(
        Number(amount) || 0
      )
    );

  await ensureAccount(
    guildId,
    userId
  );

  await users().updateOne(
    {
      guildId,
      userId
    },
    [
      {
        $set: {
          coins: {
            $max: [
              0,

              {
                $subtract: [
                  {
                    $ifNull: [
                      "$coins",
                      0
                    ]
                  },

                  safeAmount
                ]
              }
            ]
          },

          updatedAt:
            Date.now()
        }
      }
    ]
  );

  return getAccount(
    guildId,
    userId
  );
}

async function setCoins(
  guildId,
  userId,
  amount
) {
  const safeAmount =
    Math.max(
      0,
      Math.floor(
        Number(amount) || 0
      )
    );

  await users().updateOne(
    {
      guildId,
      userId
    },
    {
      $set: {
        coins:
          safeAmount,

        updatedAt:
          Date.now()
      },

      $setOnInsert: {
        guildId,
        userId,

        xp: 0,

        messageCount: 0,

        createdAt:
          Date.now()
      }
    },
    {
      upsert: true
    }
  );

  return getAccount(
    guildId,
    userId
  );
}

/* =========================================================
   LEADERBOARD
========================================================= */

async function getLeaderboard(
  guildId,
  limit = 10
) {
  const safeLimit =
    Math.min(
      100,
      Math.max(
        1,
        Math.floor(
          Number(limit) || 10
        )
      )
    );

  return users()
    .find({
      guildId
    })
    .sort({
      xp: -1,
      coins: -1
    })
    .limit(
      safeLimit
    )
    .toArray();
}

/* =========================================================
   STEAL SYSTEM
========================================================= */

async function stealCoins(
  guild,
  thiefId
) {
  const key =
    `${guild.id}:${thiefId}`;

  /*
    Keep the cooldown in memory.

    This prevents immediate repeated
    steal attempts while the process
    is running.
  */

  if (
    !global.__itamarosStealCooldowns
  ) {
    global.__itamarosStealCooldowns =
      new Map();
  }

  const cooldowns =
    global.__itamarosStealCooldowns;

  const now =
    Date.now();

  const last =
    cooldowns.get(key) || 0;

  const remaining =
    STEAL_COOLDOWN_MS -
    (
      now -
      last
    );

  if (
    remaining > 0
  ) {
    return {
      cooldown:
        Math.ceil(
          remaining / 1000
        )
    };
  }

  const members =
    await guild.members.fetch();

  const targets =
    members.filter(
      member =>
        !member.user.bot &&
        member.id !== thiefId
    );

  if (
    !targets.size
  ) {
    return {
      noTarget: true
    };
  }

  const target =
    targets.random();

  const die =
    Math.floor(
      Math.random() * 6
    ) + 1;

  const amount =
    die * 10;

  cooldowns.set(
    key,
    now
  );

  await ensureAccount(
    guild.id,
    target.id
  );

  await addCoins(
    guild.id,
    thiefId,
    amount
  );

  await removeCoins(
    guild.id,
    target.id,
    amount
  );

  return {
    target,

    die,

    amount,

    thief:
      await getAccount(
        guild.id,
        thiefId
      ),

    targetAccount:
      await getAccount(
        guild.id,
        target.id
      )
  };
}

/* =========================================================
   INVENTORY
========================================================= */

async function grantInventoryItem(
  guildId,
  userId,
  itemId,
  amount = 1
) {
  const safeAmount =
    Math.max(
      1,
      Math.floor(
        Number(amount) || 1
      )
    );

  await inventory().updateOne(
    {
      guildId,
      userId
    },
    {
      $inc: {
        [`items.${itemId}`]:
          safeAmount
      },

      $set: {
        updatedAt:
          Date.now()
      },

      $setOnInsert: {
        guildId,
        userId,

        createdAt:
          Date.now()
      }
    },
    {
      upsert: true
    }
  );
}

async function getInventory(
  guildId,
  userId
) {
  const document =
    await inventory().findOne({
      guildId,
      userId
    });

  return (
    document?.items ||
    {}
  );
}

/* =========================================================
   XP PROGRESS
========================================================= */

async function getXpProgress(
  guildId,
  userId
) {
  const account =
    await getAccount(
      guildId,
      userId
    );

  const settings =
    await getXpSettings(
      guildId
    );

  const level =
    levelFromXp(
      account.xp
    );

  const currentLevelXp =
    xpForLevel(
      level
    );

  const nextLevelXp =
    xpForLevel(
      level + 1
    );

  const xpIntoLevel =
    Math.max(
      0,
      account.xp -
      currentLevelXp
    );

  const xpNeeded =
    Math.max(
      0,
      nextLevelXp -
      account.xp
    );

  return {
    account,

    settings,

    level,

    currentLevelXp,

    nextLevelXp,

    xpIntoLevel,

    xpNeeded,

    messageCount:
      account.messageCount ||
      0,

    messagesRequired:
      account.xpMessagesRequired ||
      settings.messagesRequired
  };
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  DEFAULT_XP_MIN,
  DEFAULT_XP_MAX,
  DEFAULT_MESSAGES_REQUIRED,
  DEFAULT_MESSAGE_INCREMENT,
  DEFAULT_MAX_MESSAGES_REQUIRED,

  levelFromXp,
  xpForLevel,

  ensureXpSettings,
  getXpSettings,
  updateXpSettings,

  ensureAccount,
  getAccount,

  addXp,
  removeXp,
  setXp,

  processMessageXp,
  awardMessageXp,

  addCoins,
  removeCoins,
  setCoins,

  getLeaderboard,

  stealCoins,

  grantInventoryItem,
  getInventory,

  getXpProgress
};
