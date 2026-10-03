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
   REQUIRED CHANNEL PERMISSIONS
========================= */

const REQUIRED_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory
];

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
   CHECK CHANNEL PERMISSIONS
========================= */

function getMissingChannelPermissions(
  channel
) {
  if (
    !channel ||
    !channel.guild
  ) {
    return [];
  }

  const me =
    channel.guild.members.me;

  if (!me) {
    return [
      "View Channel",
      "Send Messages",
      "Embed Links",
      "Read Message History"
    ];
  }

  const permissions =
    channel.permissionsFor(me);

  if (!permissions) {
    return [
      "View Channel",
      "Send Messages",
      "Embed Links",
      "Read Message History"
    ];
  }

  return REQUIRED_CHANNEL_PERMISSIONS
    .filter(
      permission =>
        !permissions.has(permission)
    )
    .map(
      permission =>
        PERMISSION_NAMES[permission]
    );
}

/* =========================
   PERMISSION ERROR MESSAGE
========================= */

function permissionErrorMessage(
  missingPermissions
) {
  return [
    "❌ **I don't have the required permissions in this channel.**",
    "",
    "**Required permissions:**",
    ...missingPermissions.map(
      permission =>
        `- ${permission}`
    ),
    "",
    "**Please give these permissions to the bot's role.**"
  ].join("\n");
}

/* =========================
   CHECK COMMAND CHANNEL
========================= */

async function checkCommandPermissions(
  interaction
) {
  const channel =
    interaction.channel;

  const missing =
    getMissingChannelPermissions(
      channel
    );

  if (!missing.length) {
    return true;
  }

  await interaction.reply({
    content:
      permissionErrorMessage(
        missing
      ),
    flags: MessageFlags.Ephemeral
  });

  return false;
}

/* =========================
   CHECK BUTTON CHANNEL
========================= */

async function checkButtonPermissions(
  interaction
) {
  const channel =
    interaction.channel;

  const missing =
    getMissingChannelPermissions(
      channel
    );

  if (!missing.length) {
    return true;
  }

  if (
    interaction.deferred ||
    interaction.replied
  ) {
    await interaction.editReply({
      content:
        permissionErrorMessage(
          missing
        ),
      components: []
    });
  } else {
    await interaction.reply({
      content:
        permissionErrorMessage(
          missing
        ),
      flags: MessageFlags.Ephemeral
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
    .setDescription("Check if the bot is online."),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Start a giveaway.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("The giveaway prize.")
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
        .setDescription("Number of winners.")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("drop")
    .setDescription("Start a first-click drop.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild.toString()
    )
    .addStringOption(option =>
      option
        .setName("prize")
        .setDescription("The drop prize.")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("force-end")
    .setDescription("Force-end an active giveaway or drop.")
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
   THINKING TEXT
========================= */

function thinkingMessage() {
  return "-# *itamaros bot is thinking...*";
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
        .setLabel("🎉 CLAIM")
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

  /* =========================
     NO ENTRIES
  ========================= */

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
            value: "No winner"
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

  /* =========================
     WINNERS
  ========================= */

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

  /* =========================
     PUBLIC END MESSAGE
  ========================= */

  await message.channel.send(
    `🎉 GIVEAWAY ENDED!\n\nPrize: **${giveaway.prize}**\nWinner(s): ${winnerText}${forceText}`
  );

  /* =========================
     WINNER DMS
  ========================= */

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

  /* =========================
     HOST DM
  ========================= */

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
   GIVEAWAY SCHEDULER
========================= */

function scheduleGiveaway(
  giveaway
) {
  const remaining =
    giveaway.endsAt -
    Date.now();

  if (remaining <= 0) {
    finishGiveaway(
      giveaway
    ).catch(console.error);

    return;
  }

  const maxTimeout =
    2147483647;

  const timeout =
    Math.min(
      remaining,
      maxTimeout
    );

  setTimeout(() => {
    if (
      remaining >
      maxTimeout
    ) {
      scheduleGiveaway(
        giveaway
      );

      return;
    }

    finishGiveaway(
      giveaway
    ).catch(console.error);
  }, timeout);
}

/* =========================
   CREATE GIVEAWAY
========================= */

async function createGiveaway(
  interaction
) {
  const prize =
    interaction.options.getString(
      "prize",
      true
    );

  const durationText =
    interaction.options.getString(
      "duration",
      true
    );

  const winners =
    interaction.options.getInteger(
      "winners",
      true
    );

  const duration =
    parseDuration(
      durationText
    );

  if (!duration) {
    await interaction.reply({
      content:
        "Invalid duration. Use formats like `1M`, `5M`, `1H`, `6H`, `1D`, `7D`, `1W`, or `3W`.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  if (
    !(await checkCommandPermissions(
      interaction
    ))
  ) {
    return;
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
  });

  await interaction.editReply({
    content:
      thinkingMessage()
  });

  const endsAt =
    Date.now() +
    duration;

  const giveaway = {
    type: "giveaway",
    messageId: null,
    channelId:
      interaction.channelId,
    guildId:
      interaction.guildId,
    hostId:
      interaction.user.id,
    prize,
    winners,
    entries: [],
    endsAt,
    finished: false,
    createdAt: Date.now()
  };

  const collection =
    getCollection();

  const insertResult =
    await collection.insertOne(
      giveaway
    );

  giveaway._id =
    insertResult.insertedId;

  const message =
    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
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
                String(
                  winners
                )
            },
            {
              name: "ENTRIES",
              value: "0"
            }
          )
      ]
    });

  giveaway.messageId =
    message.id;

  await collection.updateOne(
    {
      _id:
        giveaway._id
    },
    {
      $set: {
        messageId:
          message.id
      }
    }
  );

  await message.edit({
    components: [
      createGiveawayButton(
        message.id,
        0
      )
    ]
  });

  await interaction.deleteReply();

  scheduleGiveaway(
    giveaway
  );
}

/* =========================
   CREATE DROP
========================= */

async function createDrop(
  interaction
) {
  const prize =
    interaction.options.getString(
      "prize"
    );

  if (
    !(await checkCommandPermissions(
      interaction
    ))
  ) {
    return;
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
  });

  await interaction.editReply({
    content:
      thinkingMessage()
  });

  const drop = {
    type: "drop",
    messageId: null,
    channelId:
      interaction.channelId,
    guildId:
      interaction.guildId,
    hostId:
      interaction.user.id,
    prize:
      prize || "",
    finished: false,
    createdAt: Date.now()
  };

  const collection =
    getCollection();

  const insertResult =
    await collection.insertOne(
      drop
    );

  drop._id =
    insertResult.insertedId;

  const message =
    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
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
          )
      ]
    });

  drop.messageId =
    message.id;

  await collection.updateOne(
    {
      _id:
        drop._id
    },
    {
      $set: {
        messageId:
          message.id
      }
    }
  );

  await message.edit({
    components: [
      createDropButton(
        message.id
      )
    ]
  });

  await interaction.deleteReply();
}

/* =========================
   FORCE END MENU
========================= */

async function showForceEndMenu(
  interaction
) {
  if (
    !(await checkCommandPermissions(
      interaction
    ))
  ) {
    return;
  }

  const collection =
    getCollection();

  const activeItems =
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

  if (
    !activeItems.length
  ) {
    await interaction.reply({
      content:
        "There are no active giveaways or drops.",
      flags:
        MessageFlags.Ephemeral
    });

    return;
  }

  const options =
    activeItems.map(
      item => {
        const label =
          item.type ===
          "giveaway"
            ? `Giveaway: ${item.prize}`
            : `Drop: ${
                item.prize ||
                "No prize"
              }`;

        return {
          label:
            label.slice(
              0,
              100
            ),
          value:
            item.messageId,
          description:
            item.type ===
            "giveaway"
              ? `${
                  item.entries
                    ?.length ||
                  0
                } ENTRIES`
              : "First click wins"
        };
      }
    );

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        "force_end_select"
      )
      .setPlaceholder(
        "Select a giveaway or drop..."
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
      "Select the giveaway or drop you want to force-end:",
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
    await interaction.editReply({
      content:
        "That giveaway or drop is no longer active.",
      components: []
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

  await interaction.editReply({
    content:
      "Successfully force-ended.",
    components: []
  });
}

/* =========================
   RESTORE GIVEAWAYS
========================= */

async function restoreActiveGiveaways() {
  const collection =
    getCollection();

  const activeGiveaways =
    await collection
      .find({
        type: "giveaway",
        finished: false
      })
      .toArray();

  console.log(
    `Restoring ${activeGiveaways.length} active giveaway(s).`
  );

  for (
    const giveaway of
    activeGiveaways
  ) {
    scheduleGiveaway(
      giveaway
    );
  }
}

/* =========================
   READY
========================= */

client.once(
  "clientReady",
  async () => {
    console.log(
      `ItamaRos Bot is online as ${client.user.tag}`
    );

    try {
      await connectDatabase();

      await registerCommands();

      await restoreActiveGiveaways();
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
      /* =====================
         SLASH COMMANDS
      ===================== */

      if (
        interaction.isChatInputCommand()
      ) {
        if (
          interaction.commandName ===
          "ping"
        ) {
          const latency =
            Date.now() -
            interaction.createdTimestamp;

          await interaction.reply({
            content:
              `PONG! 🏓\n${Math.max(
                0,
                latency
              )} MS`
          });

          return;
        }

        if (
          interaction.commandName ===
          "giveaway"
        ) {
          if (
            !interaction.memberPermissions.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "You need Manage Server permission to use this command.",
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
            !interaction.memberPermissions.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "You need Manage Server permission to use this command.",
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
            !interaction.memberPermissions.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            await interaction.reply({
              content:
                "You need Manage Server permission to use this command.",
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

      /* =====================
         GIVEAWAY ENTER
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_leave_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_keep_"
        ) &&
        !interaction.customId.startsWith(
          "giveaway_enter_again_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const messageId =
          interaction.customId.replace(
            "giveaway_",
            ""
          );

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type:
              "giveaway",
            finished:
              false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "This giveaway has already ended."
          });

          return;
        }

        const alreadyEntered =
          giveaway.entries?.includes(
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
              type:
                "giveaway",
              finished:
                false,
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
              "You could not enter the giveaway."
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const embed =
            message.embeds[0]
              ? EmbedBuilder.from(
                  message.embeds[0]
                )
              : null;

          if (embed) {
            const entryField =
              embed.data.fields?.find(
                field =>
                  field.name ===
                  "ENTRIES"
              );

            if (
              entryField
            ) {
              entryField.value =
                String(
                  updated.entries
                    .length
                );
            }

            await message.edit({
              embeds: [
                embed
              ],
              components: [
                createGiveawayButton(
                  updated.messageId,
                  updated.entries
                    .length
                )
              ]
            });
          }
        }

        await interaction.editReply({
          content:
            `You entered the giveaway!\n\nYou are now one of ${updated.entries.length} ENTRIES.`,
          components: [
            createGiveawayUserButtons(
              messageId
            )
          ]
        });

        return;
      }

      /* =====================
         KEEP ME IN
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_keep_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        const messageId =
          interaction.customId.replace(
            "giveaway_keep_",
            ""
          );

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type:
              "giveaway",
            finished:
              false
          });

        if (!giveaway) {
          await interaction.reply({
            content:
              "This giveaway has already ended.",
            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        const isEntered =
          giveaway.entries?.includes(
            interaction.user.id
          );

        if (!isEntered) {
          await interaction.reply({
            content:
              "You are not currently entered in this giveaway.",
            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        await interaction.deferUpdate();

        try {
          await interaction.deleteReply();
        } catch (error) {
          console.error(
            "Could not delete KEEP ME IN reply:",
            error
          );
        }

        return;
      }

      /* =====================
         GIVEAWAY LEAVE
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_leave_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferUpdate();

        const messageId =
          interaction.customId.replace(
            "giveaway_leave_",
            ""
          );

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type:
              "giveaway",
            finished:
              false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "This giveaway has already ended.",
            components: []
          });

          return;
        }

        if (
          !giveaway.entries?.includes(
            interaction.user.id
          )
        ) {
          await interaction.editReply({
            content:
              "You are not currently entered in this giveaway.",
            components: [
              createEnterAgainButton(
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
              type:
                "giveaway",
              finished:
                false,
              entries:
                interaction.user.id
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
              "You could not leave the giveaway.",
            components: []
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const embed =
            message.embeds[0]
              ? EmbedBuilder.from(
                  message.embeds[0]
                )
              : null;

          if (embed) {
            const entryField =
              embed.data.fields?.find(
                field =>
                  field.name ===
                  "ENTRIES"
              );

            if (
              entryField
            ) {
              entryField.value =
                String(
                  updated.entries
                    .length
                );
            }

            await message.edit({
              embeds: [
                embed
              ],
              components: [
                createGiveawayButton(
                  updated.messageId,
                  updated.entries
                    .length
                )
              ]
            });
          }
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

      /* =====================
         ENTER AGAIN
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "giveaway_enter_again_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const messageId =
          interaction.customId.replace(
            "giveaway_enter_again_",
            ""
          );

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            messageId,
            type:
              "giveaway",
            finished:
              false
          });

        if (!giveaway) {
          await interaction.editReply({
            content:
              "This giveaway has already ended.",
            components: []
          });

          return;
        }

        if (
          giveaway.entries?.includes(
            interaction.user.id
          )
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
              type:
                "giveaway",
              finished:
                false,
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
              "You could not enter the giveaway."
          });

          return;
        }

        const message =
          await getOriginalMessage(
            updated
          );

        if (message) {
          const embed =
            message.embeds[0]
              ? EmbedBuilder.from(
                  message.embeds[0]
                )
              : null;

          if (embed) {
            const entryField =
              embed.data.fields?.find(
                field =>
                  field.name ===
                  "ENTRIES"
              );

            if (
              entryField
            ) {
              entryField.value =
                String(
                  updated.entries
                    .length
                );
            }

            await message.edit({
              embeds: [
                embed
              ],
              components: [
                createGiveawayButton(
                  updated.messageId,
                  updated.entries
                    .length
                )
              ]
            });
          }
        }

        await interaction.editReply({
          content:
            `You entered the giveaway again!\n\nYou are now one of ${updated.entries.length} ENTRIES.`,
          components: [
            createGiveawayUserButtons(
              messageId
            )
          ]
        });

        return;
      }

      /* =====================
         DROP BUTTON
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "drop_"
        )
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const messageId =
          interaction.customId.replace(
            "drop_",
            ""
          );

        const collection =
          getCollection();

        const drop =
          await collection.findOne({
            messageId,
            type:
              "drop",
            finished:
              false
          });

        if (!drop) {
          await interaction.editReply({
            content:
              "This drop has already ended."
          });

          return;
        }

        const claimed =
          await claimDrop(
            drop,
            interaction.user.id
          );

        if (claimed) {
          await interaction.editReply({
            content:
              "🎉 You won the drop!"
          });
        } else {
          await interaction.editReply({
            content:
              "Someone else already claimed the drop."
          });
        }

        return;
      }

      /* =====================
         FORCE END SELECT
      ===================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "force_end_select"
      ) {
        if (
          !(await checkButtonPermissions(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferUpdate();

        const messageId =
          interaction.values[0];

        await forceEnd(
          interaction,
          messageId
        );

        return;
      }
    } catch (error) {
      console.error(
        "Interaction error:",
        error
      );

      try {
        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.editReply({
            content:
              "An error occurred while processing the request.",
            components: []
          });
        } else {
          await interaction.reply({
            content:
              "An error occurred while processing the request.",
            flags:
              MessageFlags.Ephemeral
          });
        }
      } catch {}
    }
  }
);

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
