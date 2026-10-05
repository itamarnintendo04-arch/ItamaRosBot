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

/*
  Permissions are checked per action.

  The bot does NOT require every permission
  for every action.

  Example:
  - /ping only needs View Channel + Send Messages.
  - /giveaway needs View Channel + Send Messages
    + Embed Links + Read Message History.
  - Button actions can request only the permissions
    required for that specific action.
*/

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
    PermissionFlagsBits.ReadMessageHistory
  ],

  giveawayUpdate: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory
  ],

  dropButton: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
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
    ),

  new SlashCommandBuilder()
    .setName("active-giveaways")
    .setDescription(
      "View all active giveaways."
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
      `🎉 Your drop has ended.\n\nPrize: **${
        drop.prize ||
        "the drop"
      }**\nWinner: ${winnerText}${forceText}`
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
      new Date(
        giveaway.endsAt
      ).getTime() -
        Date.now()
    );

  setTimeout(
    async () => {
      try {
        const collection =
          getCollection();

        const active =
          await collection.findOne({
            messageId:
              giveaway.messageId,
            type:
              "giveaway",
            finished:
              false
          });

        if (!active) {
          return;
        }

        await finishGiveaway(
          active
        );
      } catch (error) {
        console.error(
          "Scheduled giveaway finish failed:",
          error
        );
      }
    },
    delay
  );
}

/* =========================
   SCHEDULE ACTIVE GIVEAWAYS
========================= */

async function scheduleActiveGiveaways() {
  try {
    const collection =
      getCollection();

    const activeGiveaways =
      await collection
        .find({
          type:
            "giveaway",
          finished:
            false
        })
        .toArray();

    for (
      const giveaway of
      activeGiveaways
    ) {
      scheduleGiveaway(
        giveaway
      );
    }

    console.log(
      `Scheduled ${activeGiveaways.length} active giveaway(s).`
    );
  } catch (error) {
    console.error(
      "Could not schedule active giveaways:",
      error
    );
  }
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
      interaction,
      "giveaway"
    ))
  ) {
    return;
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
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
   ACTIVE GIVEAWAYS
========================= */

function formatRemainingTime(
  endsAt
) {
  const remaining =
    new Date(endsAt).getTime() -
    Date.now();

  if (remaining <= 0) {
    return "Ending now";
  }

  const totalMinutes =
    Math.floor(
      remaining /
        (60 * 1000)
    );

  const days =
    Math.floor(
      totalMinutes /
        (60 * 24)
    );

  const hours =
    Math.floor(
      (totalMinutes %
        (60 * 24)) /
        60
    );

  const minutes =
    totalMinutes % 60;

  const parts = [];

  if (days > 0) {
    parts.push(
      `${days} day${days === 1 ? "" : "s"}`
    );
  }

  if (hours > 0) {
    parts.push(
      `${hours} hour${hours === 1 ? "" : "s"}`
    );
  }

  if (
    minutes > 0 ||
    parts.length === 0
  ) {
    parts.push(
      `${minutes} minute${minutes === 1 ? "" : "s"}`
    );
  }

  return parts.join(
    " and "
  );
}

function buildActiveGiveawaysView(
  giveaways,
  page = 0
) {
  const PAGE_SIZE =
    25;

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        giveaways.length /
          PAGE_SIZE
      )
    );

  const safePage =
    Math.min(
      Math.max(page, 0),
      totalPages - 1
    );

  const start =
    safePage *
    PAGE_SIZE;

  const pageItems =
    giveaways.slice(
      start,
      start + PAGE_SIZE
    );

  const embed =
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(
        "🎉 ACTIVE GIVEAWAYS"
      )
      .setDescription(
        pageItems.length
          ? "Select a giveaway below to open it."
          : "There are no active giveaways right now."
      )
      .setFooter({
        text:
          totalPages > 1
            ? `Page ${safePage + 1} of ${totalPages}`
            : "ItamaRos Bot"
      });

  for (
    const giveaway of
    pageItems
  ) {
    const endsAt =
      new Date(
        giveaway.endsAt
      );

    const timestamp =
      Math.floor(
        endsAt.getTime() /
          1000
      );

    embed.addFields({
      name:
        `🎁 ${String(
          giveaway.prize
        ).slice(
          0,
          250
        )}`,

      value: [
        `👥 **${
          giveaway.entries?.length ||
          0
        } ENTRIES**`,

        `📅 **${endsAt.toLocaleDateString(
          "en-GB"
        )}**`,

        `🕐 **${endsAt.toLocaleTimeString(
          "en-GB",
          {
            hour:
              "2-digit",
            minute:
              "2-digit"
          }
        )}**`,

        `⏳ **${formatRemainingTime(
          giveaway.endsAt
        )} remaining**`,

        `🕐 <t:${timestamp}:R>`
      ].join("\n"),

      inline:
        false
    });
  }

  const components =
    [];

  if (
    pageItems.length
  ) {
    const options =
      pageItems.map(
        giveaway => ({
          label:
            `🎁 ${String(
              giveaway.prize
            ).slice(
              0,
              95
            )}`,

          description:
            `${
              giveaway.entries?.length ||
              0
            } entries • ${formatRemainingTime(
              giveaway.endsAt
            )} left`.slice(
              0,
              100
            ),

          value:
            giveaway.messageId
        })
      );

    components.push(
      new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(
              "active_giveaway_select"
            )
            .setPlaceholder(
              "Select a giveaway..."
            )
            .addOptions(
              options
            )
        )
    );
  }

  if (
    totalPages > 1
  ) {
    components.push(
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `active_giveaways_page_${
                safePage - 1
              }`
            )
            .setLabel(
              "⬅️ PREVIOUS"
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(
              safePage === 0
            ),

          new ButtonBuilder()
            .setCustomId(
              `active_giveaways_page_${
                safePage + 1
              }`
            )
            .setLabel(
              "NEXT ➡️"
            )
            .setStyle(
              ButtonStyle.Secondary
            )
            .setDisabled(
              safePage ===
                totalPages - 1
            )
        )
    );
  }

  return {
    embeds: [
      embed
    ],
    components
  };
}

async function showActiveGiveaways(
  interaction,
  page = 0,
  update = false
) {
  const collection =
    getCollection();

  const giveaways =
    await collection
      .find({
        guildId:
          interaction.guildId,

        type:
          "giveaway",

        finished:
          false
      })
      .sort({
        createdAt:
          -1
      })
      .toArray();

  const view =
    buildActiveGiveawaysView(
      giveaways,
      page
    );

  if (update) {
    await interaction.update(
      view
    );
  } else {
    await interaction.reply({
      ...view,
      flags:
        MessageFlags.Ephemeral
    });
  }
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
      interaction,
      "drop"
    ))
  ) {
    return;
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral
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
      interaction,
      "forceEnd"
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
        finished:
          false
      })
      .sort({
        createdAt:
          -1
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
              ? `${item.entries?.length || 0} entries`
              : "First-click drop"
        };
      }
    );

  await interaction.reply({
    content:
      "Select the giveaway or drop you want to force-end:",
    components: [
      new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(
              "force_end_select"
            )
            .setPlaceholder(
              "Select an active item..."
            )
            .addOptions(
              options
            )
        )
    ],
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
      guildId:
        interaction.guildId,
      messageId,
      finished:
        false
    });

  if (!item) {
    await interaction.editReply({
      content:
        "❌ This giveaway or drop is no longer active.",
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

    await interaction.editReply({
      content:
        "✅ The giveaway was force-ended.",
      components: []
    });

    return;
  }

  if (
    item.type ===
    "drop"
  ) {
    await claimDrop(
      item,
      null,
      interaction.user
    );

    await interaction.editReply({
      content:
        "✅ The drop was force-ended.",
      components: []
    });

    return;
  }

  await interaction.editReply({
    content:
      "❌ Unknown active item type.",
    components: []
  });
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

      console.log(
        "Database ready."
      );

      await registerCommands();

      await scheduleActiveGiveaways();

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
          if (
            !(await checkCommandPermissions(
              interaction,
              "ping"
            ))
          ) {
            return;
          }

          await interaction.reply({
            content:
              "🏓 Pong!",
            flags:
              MessageFlags.Ephemeral
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

        if (
          interaction.commandName ===
          "active-giveaways"
        ) {
          await showActiveGiveaways(
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
            interaction,
            "giveawayButton"
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
            interaction,
            "giveawayButton"
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

        await interaction.reply({
          content:
            "You’re still in. Good luck!✅❤️",
          flags:
            MessageFlags.Ephemeral
        });

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
            interaction,
            "giveawayButton"
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
            interaction,
            "giveawayButton"
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
            interaction,
            "dropButton"
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
         ACTIVE GIVEAWAYS PAGE
      ===================== */

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "active_giveaways_page_"
        )
      ) {
        const page =
          Number(
            interaction.customId.replace(
              "active_giveaways_page_",
              ""
            )
          );

        await showActiveGiveaways(
          interaction,
          Number.isFinite(page)
            ? page
            : 0,
          true
        );

        return;
      }

      /* =====================
         ACTIVE GIVEAWAY SELECT
      ===================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "active_giveaway_select"
      ) {
        const messageId =
          interaction.values[0];

        const collection =
          getCollection();

        const giveaway =
          await collection.findOne({
            guildId:
              interaction.guildId,

            messageId,

            type:
              "giveaway",

            finished:
              false
          });

        if (!giveaway) {
          await interaction.reply({
            content:
              "❌ This giveaway is no longer active.",
            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        const endsAt =
          new Date(
            giveaway.endsAt
          );

        const giveawayUrl =
          `https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`;

        await interaction.reply({
          content: [
            `🎁 **${giveaway.prize}**`,
            "",
            `👥 **${
              giveaway.entries?.length ||
              0
            } ENTRIES**`,
            `📅 **${endsAt.toLocaleDateString(
              "en-GB"
            )}**`,
            `🕐 **${endsAt.toLocaleTimeString(
              "en-GB",
              {
                hour:
                  "2-digit",
                minute:
                  "2-digit"
              }
            )}**`,
            `⏳ **${formatRemainingTime(
              giveaway.endsAt
            )} remaining**`
          ].join("\n"),

          components: [
            new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setLabel(
                    "🎯 GO TO GIVEAWAY"
                  )
                  .setStyle(
                    ButtonStyle.Link
                  )
                  .setURL(
                    giveawayUrl
                  )
              )
          ],

          flags:
            MessageFlags.Ephemeral
        });

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
            interaction,
            "forceEnd"
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
