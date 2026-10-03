require("dotenv").config();

const http = require("http");

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} = require("discord.js");

const {
  connectDatabase,
  getDatabase
} = require("./database");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error(
    "DISCORD_TOKEN, CLIENT_ID or GUILD_ID is missing."
  );
}

/* =========================
   HTTP SERVER
========================= */

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("ItamaRos Bot is online!");
});

server.listen(
  process.env.PORT || 3000,
  () => {
    console.log(
      `Web server is running on port ${
        process.env.PORT || 3000
      }`
    );
  }
);

/* =========================
   DISCORD CLIENT
========================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* =========================
   DATABASE
========================= */

function getCollection() {
  return getDatabase().collection("giveaways");
}

/* =========================
   CHANNEL PERMISSIONS
========================= */

const ACTION_PERMISSIONS = {
  ping: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages
  ],

  giveaway: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  drop: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  forceEnd: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  giveawayButton: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  giveawayKeep: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages
  ],

  giveawayLeave: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  giveawayEnterAgain: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  dropButton: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  forceEndSelect: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ]
};

/* =========================
   PERMISSION NAMES
========================= */

const PERMISSION_NAMES = {
  [PermissionFlagsBits.ViewChannel]:
    "View Channel",

  [PermissionFlagsBits.SendMessages]:
    "Send Messages",

  [PermissionFlagsBits.EmbedLinks]:
    "Embed Links",

  [PermissionFlagsBits.ReadMessageHistory]:
    "Read Message History"
};

/* =========================
   GET REQUIRED PERMISSIONS
========================= */

function getRequiredPermissions(
  action
) {
  return (
    ACTION_PERMISSIONS[action] || []
  );
}

/* =========================
   CHECK CHANNEL PERMISSIONS
========================= */

function getMissingChannelPermissions(
  channel,
  action
) {
  if (!channel || !channel.guild) {
    return [];
  }

  const requiredPermissions =
    getRequiredPermissions(
      action
    );

  const me =
    channel.guild.members.me;

  if (!me) {
    return requiredPermissions.map(
      permission =>
        PERMISSION_NAMES[
          permission
        ] || permission
    );
  }

  const permissions =
    channel.permissionsFor(me);

  if (!permissions) {
    return requiredPermissions.map(
      permission =>
        PERMISSION_NAMES[
          permission
        ] || permission
    );
  }

  return requiredPermissions
    .filter(
      permission =>
        !permissions.has(
          permission
        )
    )
    .map(
      permission =>
        PERMISSION_NAMES[
          permission
        ] || permission
    );
}

/* =========================
   PERMISSION ERROR MESSAGE
========================= */

function permissionErrorMessage(
  missingPermissions,
  channel,
  action
) {
  const channelName =
    channel?.name
      ? `#${channel.name}`
      : "#unknown-channel";

  const actionName =
    action || "this action";

  return [
    "❌ **I don't have the required permissions in this channel.**",
    "",
    `📍 **Channel:** ${channelName}`,
    `⚙️ **Action:** ${actionName}`,
    "",
    "**Missing permissions:**",
    ...missingPermissions.map(
      permission =>
        `- ${permission}`
    ),
    "",
    `Please give these permissions to the bot's role in **${channelName}**.`
  ].join("\n");
}

/* =========================
   CHECK COMMAND CHANNEL
========================= */

async function checkCommandPermissions(
  interaction,
  action
) {
  const channel =
    interaction.channel;

  const missing =
    getMissingChannelPermissions(
      channel,
      action
    );

  if (!missing.length) {
    return true;
  }

  await interaction.reply({
    content:
      permissionErrorMessage(
        missing,
        channel,
        action
      ),
    flags:
      MessageFlags.Ephemeral
  });

  return false;
}

/* =========================
   CHECK BUTTON CHANNEL
========================= */

async function checkButtonPermissions(
  interaction,
  action
) {
  const channel =
    interaction.channel;

  const missing =
    getMissingChannelPermissions(
      channel,
      action
    );

  if (!missing.length) {
    return true;
  }

  const content =
    permissionErrorMessage(
      missing,
      channel,
      action
    );

  if (
    interaction.deferred ||
    interaction.replied
  ) {
    await interaction.editReply({
      content,
      components: []
    });
  } else {
    await interaction.reply({
      content,
      flags:
        MessageFlags.Ephemeral
    });
  }

  return false;
}

/* =========================
   SLASH COMMANDS
========================= */

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription(
      "Check if the bot is online."
    ),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription(
      "Start a giveaway."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription(
          "The giveaway prize."
        )
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("duration")
        .setDescription(
          "Examples: 1M, 5M, 1H, 6H, 1D, 7D, 1W, 3W"
        )
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("winners")
        .setDescription(
          "Number of winners."
        )
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("drop")
    .setDescription(
      "Start a first-click drop."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription(
          "The drop prize."
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("force-end")
    .setDescription(
      "Force-end an active giveaway or drop."
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
];

/* =========================
   COMMAND REGISTRATION
========================= */

async function registerCommands() {
  const rest = new REST({
    version: "10"
  }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      CLIENT_ID,
      GUILD_ID
    ),
    {
      body: commands
    }
  );

  await rest.put(
    Routes.applicationCommands(
      CLIENT_ID
    ),
    {
      body: []
    }
  );

  console.log(
    "Slash commands registered successfully:"
  );

  console.log(
    commands
      .map(command => command.name)
      .join(", ")
  );
}

/* =========================
   DURATION
========================= */

function parseDuration(duration) {
  const match =
    /^(\d+)(M|H|D|W)$/i.exec(
      duration.trim()
    );

  if (!match) {
    return null;
  }

  const amount =
    Number(match[1]);

  const unit =
    match[2].toUpperCase();

  if (amount < 1) {
    return null;
  }

  const units = {
    M: 60 * 1000,
    H: 60 * 60 * 1000,
    D: 24 * 60 * 60 * 1000,
    W: 7 * 24 * 60 * 60 * 1000
  };

  return amount * units[unit];
}

/* =========================
   FORCE-END TEXT
========================= */

function forceEndedText(userId) {
  return `-# *(force ended by <@${userId}>)*`;
}

/* =========================
   GIVEAWAY BUTTON
========================= */

function createGiveawayButton(
  messageId,
  count,
  disabled = false
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `giveaway_${messageId}`
        )
        .setLabel(
          `🎉 ${count} ENTRIES`
        )
        .setStyle(
          ButtonStyle.Success
        )
        .setDisabled(disabled)
    );
}

/* =========================
   GIVEAWAY USER BUTTONS
========================= */

function createGiveawayUserButtons(
  messageId
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `giveaway_leave_${messageId}`
        )
        .setLabel("❌ LEAVE")
        .setStyle(
          ButtonStyle.Danger
        ),

      new ButtonBuilder()
        .setCustomId(
          `giveaway_keep_${messageId}`
        )
        .setLabel(
          "✅ KEEP ME IN"
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
}

/* =========================
   ENTER AGAIN BUTTON
========================= */

function createEnterAgainButton(
  messageId
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `giveaway_enter_again_${messageId}`
        )
        .setLabel(
          "🎉 ENTER AGAIN"
        )
        .setStyle(
          ButtonStyle.Success
        )
    );
}

/* =========================
   DROP BUTTON
========================= */

function createDropButton(
  messageId,
  disabled = false
) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(
          `drop_${messageId}`
        )
        .setLabel(
          "🎉 CLAIM"
        )
        .setStyle(
          ButtonStyle.Success
        )
        .setDisabled(disabled)
    );
}

/* =========================
   WINNER SELECTION
========================= */

function pickWinners(
  entries,
  amount
) {
  const shuffled = [
    ...entries
  ];

  for (
    let i =
      shuffled.length - 1;
    i > 0;
    i--
  ) {
    const j =
      Math.floor(
        Math.random() *
          (i + 1)
      );

    [
      shuffled[i],
      shuffled[j]
    ] = [
      shuffled[j],
      shuffled[i]
    ];
  }

  return shuffled.slice(
    0,
    amount
  );
}

/* =========================
   ORIGINAL MESSAGE
========================= */

async function getOriginalMessage(
  item
) {
  try {
    const channel =
      await client.channels.fetch(
        item.channelId
      );

    if (!channel) {
      return null;
    }

    return await channel.messages.fetch(
      item.messageId
    );
  } catch (error) {
    console.error(
      "Could not fetch original message:",
      error
    );

    return null;
  }
}

/* =========================
   GIVEAWAY FINISH
========================= */

async function finishGiveaway(
  giveaway,
  forcedBy = null
) {
  const collection =
    getCollection();

  const entries =
    giveaway.entries || [];

  const winnerCount =
    Math.min(
      giveaway.winners,
      entries.length
    );

  const winners =
    pickWinners(
      entries,
      winnerCount
    );

  await collection.updateOne(
    {
      messageId:
        giveaway.messageId
    },
    {
      $set: {
        finished: true,
        winnerIds: winners,
        endedAt: Date.now(),
        forcedBy: forcedBy
          ? forcedBy.id
          : null
      }
    }
  );

  const message =
    await getOriginalMessage(
      giveaway
    );

  if (!message) {
    return;
  }

  const forceText =
    forcedBy
      ? forceEndedText(
          forcedBy.id
        )
      : "";

  if (
    entries.length === 0
  ) {
    const embed =
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(
          "🎉 GIVEAWAY ENDED!"
        )
        .addFields(
          {
            name: "Prize",
            value:
              giveaway.prize
          },
          {
            name: "Hosted by",
            value:
              `<@${giveaway.hostId}>`
          },
          {
            name: "ENTRIES",
            value: "0"
          },
          {
            name: "Winner(s)",
            value:
              "No winner"
          }
        );

    await message.edit({
      embeds: [embed],
      components: [
        createGiveawayButton(
          giveaway.messageId,
          0,
          true
        )
      ]
    });

    await message.channel.send(
      `🎉 GIVEAWAY ENDED!\n\nPrize: **${giveaway.prize}**\nWinner: **No winner**${forceText}`
    );

    try {
      const host =
        await client.users.fetch(
          giveaway.hostId
        );

      await host.send(
        `Your giveaway has ended.\n\nPrize: **${giveaway.prize}**\nWinner: **No winner**${forceText}`
      );
    } catch (error) {
      console.error(
        "Could not DM giveaway host:",
        error
      );
    }

    return;
  }

  const winnerText =
    winners.length
      ? winners
          .map(
            id =>
              `<@${id}>`
          )
          .join(", ")
      : "No winner";

  const embed =
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(
        "🎉 GIVEAWAY ENDED!"
      )
      .addFields(
        {
          name: "Prize",
          value:
            giveaway.prize
        },
        {
          name: "Hosted by",
          value:
            `<@${giveaway.hostId}>`
        },
        {
          name: "ENTRIES",
          value:
            String(
              entries.length
            )
        },
        {
          name: "Winner(s)",
          value:
            winnerText
        }
      );

  await message.edit({
    embeds: [embed],
    components: [
      createGiveawayButton(
        giveaway.messageId,
        entries.length,
        true
      )
    ]
  });

  await message.channel.send(
    `🎉 GIVEAWAY ENDED!\n\nPrize: **${giveaway.prize}**\nWinner(s): ${winnerText}${forceText}`
  );

  for (
    const winnerId of
    winners
  ) {
    try {
      const user =
        await client.users.fetch(
          winnerId
        );

      await user.send(
        `🎉 GIVEAWAY ENDED!\n\nPrize: **${giveaway.prize}**\nYou won!${forceText}`
      );
    } catch (error) {
      console.error(
        `Could not DM winner ${winnerId}:`,
        error
      );
    }
  }

  try {
    const host =
      await client.users.fetch(
        giveaway.hostId
      );

    await host.send(
      `🎉 Your giveaway has ended.\n\nPrize: **${giveaway.prize}**\nWinner(s): ${winnerText}${forceText}`
    );
  } catch (error) {
    console.error(
      "Could not DM giveaway host:",
      error
    );
  }
}

/* =========================
   DROP CLAIM / FORCE END
========================= */

async function claimDrop(
  drop,
  winnerId = null,
  forcedBy = null
) {
  const collection =
    getCollection();

  const result =
    await collection.findOneAndUpdate(
      {
        messageId:
          drop.messageId,
        type: "drop",
        finished: false
      },
      {
        $set: {
          finished: true,
          endedAt: Date.now(),
          winnerId:
            winnerId || null,
          forcedBy: forcedBy
            ? forcedBy.id
            : null
        }
      },
      {
        returnDocument:
          "after"
      }
    );

  if (!result) {
    return false;
  }

  const message =
    await getOriginalMessage(
      drop
    );

  if (!message) {
    return false;
  }

  const forceText =
    forcedBy
      ? forceEndedText(
          forcedBy.id
        )
      : "";

  const winnerText =
    winnerId
      ? `<@${winnerId}>`
      : "No winner";

  const embed =
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(
        "🎉 DROP ENDED!"
      )
      .addFields(
        {
          name: "Prize",
          value:
            drop.prize ||
            "No prize specified"
        },
        {
          name: "Hosted by",
          value:
            `<@${drop.hostId}>`
        },
        {
          name: "Winner",
          value:
            winnerText
        }
      );

  await message.edit({
    embeds: [embed],
    components: [
      createDropButton(
        drop.messageId,
        true
      )
    ]
  });

  if (winnerId) {
    await message.channel.send(
      `🎉 DROP ENDED!\n\nPrize: **${
        drop.prize ||
        "the drop"
      }**\nWinner: ${winnerText}${forceText}`
    );

    try {
      const winner =
        await client.users.fetch(
          winnerId
        );

      await winner.send(
        `🎉 DROP ENDED!\n\nPrize: **${
          drop.prize ||
          "the drop"
        }**\nYou won!${forceText}`
      );
    } catch (error) {
      console.error(
        "Could not DM drop winner:",
        error
      );
    }
  } else {
    await message.channel.send(
      `🎉 DROP ENDED!\n\nPrize: **${
        drop.prize ||
        "the drop"
      }**\nWinner: **No winner**${forceText}`
    );
  }

  try {
    const host =
      await client.users.fetch(
        drop.hostId
      );

    await host.send(
      winnerId
        ? `Your drop has ended.\n\nPrize: **${
            drop.prize ||
            "the drop"
          }**\nWinner: ${winnerText}${forceText}`
        : `Your drop has been force-ended.\n\nPrize: **${
            drop.prize ||
            "the drop"
          }**\nWinner: **No winner**${forceText}`
    );
  } catch (error) {
    console.error(
      "Could not DM drop host:",
      error
    );
  }

  return true;
}
/* =========================
   SCHEDULE GIVEAWAY
========================= */

function scheduleGiveaway(
  giveaway
) {
  const delay =
    Math.max(
      0,
      giveaway.endsAt -
        Date.now()
    );

  setTimeout(
    async () => {
      try {
        const collection =
          getCollection();

        const current =
          await collection.findOne({
            messageId:
              giveaway.messageId,
            type: "giveaway",
            finished: false
          });

        if (!current) {
          return;
        }

        await finishGiveaway(
          current
        );
      } catch (error) {
        console.error(
          "Error finishing giveaway:",
          error
        );
      }
    },
    delay
  );
}

/* =========================
   CREATE GIVEAWAY
========================= */

async function createGiveaway(
  interaction
) {
  if (
    !(
      await checkCommandPermissions(
        interaction,
        "giveaway"
      )
    )
  ) {
    return;
  }

  const prize =
    interaction.options.getString(
      "prize"
    );

  const duration =
    interaction.options.getString(
      "duration"
    );

  const winners =
    interaction.options.getInteger(
      "winners"
    );

  const durationMs =
    parseDuration(
      duration
    );

  if (!durationMs) {
    await interaction.reply({
      content:
        "❌ Invalid duration. Use formats such as `1M`, `5M`, `1H`, `1D`, or `1W`.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
  });

  const endsAt =
    Date.now() +
    durationMs;

  const embed =
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(
        "🎉 GIVEAWAY!"
      )
      .addFields(
        {
          name: "Prize",
          value: prize
        },
        {
          name: "Hosted by",
          value:
            `<@${interaction.user.id}>`
        },
        {
          name: "Winners",
          value:
            String(winners)
        },
        {
          name: "Ends",
          value:
            `<t:${Math.floor(
              endsAt / 1000
            )}:R>`
        },
        {
          name: "ENTRIES",
          value: "0"
        }
      );

  const message =
    await interaction.channel.send({
      embeds: [embed],
      components: [
        createGiveawayButton(
          "pending",
          0
        )
      ]
    });

  const giveaway = {
    type: "giveaway",
    messageId:
      message.id,
    channelId:
      message.channel.id,
    guildId:
      interaction.guildId,
    hostId:
      interaction.user.id,
    prize,
    winners,
    entries: [],
    endsAt,
    finished: false,
    createdAt:
      Date.now()
  };

  await message.edit({
    components: [
      createGiveawayButton(
        message.id,
        0
      )
    ]
  });

  await getCollection().insertOne(
    giveaway
  );

  scheduleGiveaway(
    giveaway
  );

  await interaction.editReply({
    content:
      "✅ Giveaway created successfully."
  });
}

/* =========================
   CREATE DROP
========================= */

async function createDrop(
  interaction
) {
  if (
    !(
      await checkCommandPermissions(
        interaction,
        "drop"
      )
    )
  ) {
    return;
  }

  const prize =
    interaction.options.getString(
      "prize"
    );

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
  });

  const embed =
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(
        "🎉 DROP!"
      )
      .addFields(
        {
          name: "Prize",
          value:
            prize ||
            "No prize specified"
        },
        {
          name: "Hosted by",
          value:
            `<@${interaction.user.id}>`
        }
      );

  const message =
    await interaction.channel.send({
      embeds: [embed],
      components: [
        createDropButton(
          "pending"
        )
      ]
    });

  const drop = {
    type: "drop",
    messageId:
      message.id,
    channelId:
      message.channel.id,
    guildId:
      interaction.guildId,
    hostId:
      interaction.user.id,
    prize:
      prize ||
      "No prize specified",
    entries: [],
    finished: false,
    createdAt:
      Date.now()
  };

  await message.edit({
    components: [
      createDropButton(
        message.id
      )
    ]
  });

  await getCollection().insertOne(
    drop
  );

  await interaction.editReply({
    content:
      "✅ Drop created successfully."
  });
}

/* =========================
   FORCE END MENU
========================= */

async function showForceEndMenu(
  interaction
) {
  if (
    !(
      await checkCommandPermissions(
        interaction,
        "forceEnd"
      )
    )
  ) {
    return;
  }

  const collection =
    getCollection();

  const active =
    await collection
      .find({
        guildId:
          interaction.guildId,
        finished: false
      })
      .sort({
        createdAt: -1
      })
      .limit(25)
      .toArray();

  if (!active.length) {
    await interaction.reply({
      content:
        "❌ There are no active giveaways or drops.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  const options =
    active.map(item => ({
      label:
        item.type ===
        "giveaway"
          ? `Giveaway: ${item.prize}`
          : `Drop: ${
              item.prize ||
              "No prize"
            }`,
      description:
        `Message ID: ${item.messageId}`,
      value:
        item.messageId
    }));

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "force_end_select"
      )
      .setPlaceholder(
        "Select a giveaway or drop"
      )
      .addOptions(
        options
      );

  const row =
    new ActionRowBuilder()
      .addComponents(
        menu
      );

  await interaction.reply({
    content:
      "⚠️ Select the giveaway or drop you want to force-end.",
    components: [row],
    flags:
      MessageFlags.Ephemeral
  });
}

/* =========================
   FORCE END
========================= */

async function forceEnd(
  interaction,
  messageId
) {
  const collection =
    getCollection();

  const item =
    await collection.findOne({
      messageId,
      guildId:
        interaction.guildId,
      finished: false
    });

  if (!item) {
    await interaction.followUp({
      content:
        "❌ That giveaway or drop is no longer active.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  if (
    item.type ===
    "giveaway"
  ) {
    await finishGiveaway(
      item,
      interaction.user
    );
  } else if (
    item.type ===
    "drop"
  ) {
    await claimDrop(
      item,
      null,
      interaction.user
    );
  }
}

/* =========================
   RESTORE ACTIVE ITEMS
========================= */

async function restoreActiveGiveaways() {
  const collection =
    getCollection();

  const active =
    await collection
      .find({
        finished: false
      })
      .toArray();

  console.log(
    `Restoring ${active.length} active giveaway/drop item(s).`
  );

  for (
    const item of active
  ) {
    if (
      item.type ===
      "giveaway"
    ) {
      if (
        item.endsAt <=
        Date.now()
      ) {
        try {
          await finishGiveaway(
            item
          );
        } catch (error) {
          console.error(
            "Could not finish expired giveaway:",
            error
          );
        }
      } else {
        scheduleGiveaway(
          item
        );
      }
    }
  }
}

/* =========================
   READY
========================= */

client.once(
  "ready",
  async () => {
    console.log(
      `Logged in as ${client.user.tag}`
    );

    try {
      await connectDatabase();

      await registerCommands();

      await restoreActiveGiveaways();

      console.log(
        "ItamaRos Bot is fully ready."
      );
    } catch (error) {
      console.error(
        "Startup error:",
        error
      );
    }
  }
);

/* =========================
   INTERACTIONS
========================= */

client.on(
  "interactionCreate",
  async interaction => {
    try {
      /* =========================
         SLASH COMMANDS
      ========================= */

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "ping"
        ) {
          if (
            !(
              await checkCommandPermissions(
                interaction,
                "ping"
              )
            )
          ) {
            return;
          }

          await interaction.reply(
            "🏓 Pong!"
          );

          return;
        }

        if (
          interaction.commandName ===
          "giveaway"
        ) {
          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "❌ You need the **Manage Server** permission to use this command.",
              flags:
                MessageFlags.Ephemeral
            });

            return;
          }

          await createGiveaway(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "drop"
        ) {
          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "❌ You need the **Manage Server** permission to use this command.",
              flags:
                MessageFlags.Ephemeral
            });

            return;
          }

          await createDrop(
            interaction
          );

          return;
        }

        if (
          interaction.commandName ===
          "force-end"
        ) {
          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "❌ You need the **Manage Server** permission to use this command.",
              flags:
                MessageFlags.Ephemeral
            });

            return;
          }

          await showForceEndMenu(
            interaction
          );

          return;
        }
      }

      /* =========================
         GIVEAWAY MAIN BUTTON
      ========================= */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_keep_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_leave_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_enter_again_"
        )
      ) {
        if (
          !(
            await checkButtonPermissions(
              interaction,
              "giveawayButton"
            )
          )
        ) {
          return;
        }

        const messageId =
          interaction.customId.replace(
            "giveaway_",
            ""
          );

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type: "giveaway",
            finished: false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "❌ This giveaway has already ended.",
            components: []
          });

          return;
        }

        const alreadyEntered =
          (
            giveaway.entries ||
            []
          ).includes(
            interaction.user.id
          );

        if (
          alreadyEntered
        ) {
          await interaction.editReply({
            content:
              "You are already entered in this giveaway.",
            components: [
              createGiveawayUserButtons(
                messageId
              )
            ]
          });

          return;
        }

        const updated =
          await collection.findOneAndUpdate(
            {
              messageId,
              type: "giveaway",
              finished: false,
              entries: {
                $ne:
                  interaction.user.id
              }
            },
            {
              $addToSet: {
                entries:
                  interaction.user.id
              }
            },
            {
              returnDocument:
                "after"
            }
          );

        if (!updated) {
          await interaction.editReply({
            content:
              "❌ You could not enter this giveaway.",
            components: []
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const entryCount =
            (
              updated.entries ||
              []
            ).length;

          const oldEmbed =
            message.embeds[0];

          const embed =
            oldEmbed
              ? EmbedBuilder.from(
                  oldEmbed
                )
              : new EmbedBuilder();

          const entriesField =
            embed.data.fields?.find(
              field =>
                field.name ===
                "ENTRIES"
            );

          if (entriesField) {
            entriesField.value =
              String(
                entryCount
              );
          } else {
            embed.addFields({
              name: "ENTRIES",
              value:
                String(
                  entryCount
                )
            });
          }

          await message.edit({
            embeds: [embed],
            components: [
              createGiveawayButton(
                messageId,
                entryCount
              )
            ]
          });
        }

        await interaction.editReply({
          content:
            "🎉 **YOU ARE IN!**",
          components: [
            createGiveawayUserButtons(
              messageId
            )
          ]
        });

        return;
      }

      /* =========================
         KEEP ME IN
      ========================= */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_keep_"
        )
      ) {
        if (
          !(
            await checkButtonPermissions(
              interaction,
              "giveawayKeep"
            )
          )
        ) {
          return;
        }

        const messageId =
          interaction.customId.replace(
            "giveaway_keep_",
            ""
          );

        const giveaway =
          await getCollection().findOne({
            messageId,
            type: "giveaway",
            finished: false
          });

        if (!giveaway) {
          await interaction.update({
            content:
              "❌ This giveaway has already ended.",
            components: []
          });

          return;
        }

        const isEntered =
          (
            giveaway.entries ||
            []
          ).includes(
            interaction.user.id
          );

        if (!isEntered) {
          await interaction.update({
            content:
              "❌ You are no longer entered in this giveaway.",
            components: []
          });

          return;
        }

        await interaction.update({
          content:
            "✅ YOU ARE STILL IN!",
          components: []
        });

        return;
      }

      /* =========================
         LEAVE GIVEAWAY
      ========================= */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_leave_"
        )
      ) {
        if (
          !(
            await checkButtonPermissions(
              interaction,
              "giveawayLeave"
            )
          )
        ) {
          return;
        }

        const messageId =
          interaction.customId.replace(
            "giveaway_leave_",
            ""
          );

        await interaction.deferUpdate();

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type: "giveaway",
            finished: false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "❌ This giveaway has already ended.",
            components: []
          });

          return;
        }

        const updated =
          await collection.findOneAndUpdate(
            {
              messageId,
              type: "giveaway",
              finished: false
            },
            {
              $pull: {
                entries:
                  interaction.user.id
              }
            },
            {
              returnDocument:
                "after"
            }
          );

        if (!updated) {
          await interaction.editReply({
            content:
              "❌ Could not update your giveaway entry.",
            components: []
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const entryCount =
            (
              updated.entries ||
              []
            ).length;

          const oldEmbed =
            message.embeds[0];

          const embed =
            oldEmbed
              ? EmbedBuilder.from(
                  oldEmbed
                )
              : new EmbedBuilder();

          const entriesField =
            embed.data.fields?.find(
              field =>
                field.name ===
                "ENTRIES"
            );

          if (entriesField) {
            entriesField.value =
              String(
                entryCount
              );
          } else {
            embed.addFields({
              name: "ENTRIES",
              value:
                String(
                  entryCount
                )
            });
          }

          await message.edit({
            embeds: [embed],
            components: [
              createGiveawayButton(
                messageId,
                entryCount
              )
            ]
          });
        }

        await interaction.editReply({
          content:
            "You left the giveaway.",
          components: [
            createEnterAgainButton(
              messageId
            )
          ]
        });

        return;
      }

      /* =========================
         ENTER AGAIN
      ========================= */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_enter_again_"
        )
      ) {
        if (
          !(
            await checkButtonPermissions(
              interaction,
              "giveawayEnterAgain"
            )
          )
        ) {
          return;
        }

        const messageId =
          interaction.customId.replace(
            "giveaway_enter_again_",
            ""
          );

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type: "giveaway",
            finished: false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "❌ This giveaway has already ended.",
            components: []
          });

          return;
        }

        const updated =
          await collection.findOneAndUpdate(
            {
              messageId,
              type: "giveaway",
              finished: false,
              entries: {
                $ne:
                  interaction.user.id
              }
            },
            {
              $addToSet: {
                entries:
                  interaction.user.id
              }
            },
            {
              returnDocument:
                "after"
            }
          );

        if (!updated) {
          await interaction.editReply({
            content:
              "You are already entered in this giveaway.",
            components: [
              createGiveawayUserButtons(
                messageId
              )
            ]
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const entryCount =
            (
              updated.entries ||
              []
            ).length;

          const oldEmbed =
            message.embeds[0];

          const embed =
            oldEmbed
              ? EmbedBuilder.from(
                  oldEmbed
                )
              : new EmbedBuilder();

          const entriesField =
            embed.data.fields?.find(
              field =>
                field.name ===
                "ENTRIES"
            );

          if (entriesField) {
            entriesField.value =
              String(
                entryCount
              );
          } else {
            embed.addFields({
              name: "ENTRIES",
              value:
                String(
                  entryCount
                )
            });
          }

          await message.edit({
            embeds: [embed],
            components: [
              createGiveawayButton(
                messageId,
                entryCount
              )
            ]
          });
        }

        await interaction.editReply({
          content:
            "🎉 **YOU ARE IN AGAIN!**",
          components: [
            createGiveawayUserButtons(
              messageId
            )
          ]
        });

        return;
      }

      /* =========================
         DROP BUTTON
      ========================= */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "drop_"
        )
      ) {
        if (
          !(
            await checkButtonPermissions(
              interaction,
              "dropButton"
            )
          )
        ) {
          return;
        }

        const messageId =
          interaction.customId.replace(
            "drop_",
            ""
          );

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const collection =
          getCollection();

        const drop =
          await collection.findOne({
            messageId,
            type: "drop",
            finished: false
          });

        if (!drop) {
          await interaction.editReply({
            content:
              "❌ This drop has already ended.",
            components: []
          });

          return;
        }

        const claimed =
          await claimDrop(
            drop,
            interaction.user.id
          );

        if (!claimed) {
          await interaction.editReply({
            content:
              "❌ Someone else already claimed this drop.",
            components: []
          });

          return;
        }

        await interaction.editReply({
          content:
            "🎉 **YOU WON THE DROP!**",
          components: []
        });

        return;
      }

      /* =========================
         FORCE END SELECT
      ========================= */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "force_end_select"
      ) {
        if (
          !(
            await checkButtonPermissions(
              interaction,
              "forceEndSelect"
            )
          )
        ) {
          return;
        }

        const messageId =
          interaction.values[0];

        await interaction.deferUpdate();

        await forceEnd(
          interaction,
          messageId
        );

        await interaction.editReply({
          content:
            "✅ The selected giveaway/drop was force-ended.",
          components: []
        });

        return;
      }
    } catch (error) {
      console.error(
        "Interaction error:",
        error
      );

      try {
        if (
          interaction.deferred ||
          interaction.replied
        ) {
          await interaction.editReply({
            content:
              "❌ An unexpected error occurred.",
            components: []
          });
        } else {
          await interaction.reply({
            content:
              "❌ An unexpected error occurred.",
            flags:
              MessageFlags.Ephemeral
          });
        }
      } catch (replyError) {
        console.error(
          "Could not send error response:",
          replyError
        );
      }
    }
  }
);

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
